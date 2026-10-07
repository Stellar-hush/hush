import type { SmtpConfig } from "@/config/schema";
import type { DeliveryReceipt, NotificationAdapter, VerificationEmailMessage } from "./adapter";

/**
 * BETA-005: Self-hosted SMTP delivery adapter.
 *
 * A minimal RFC 5321 client implemented directly over a socket transport, so
 * account verification delivery never depends on a third-party mail vendor.
 * The socket source is pluggable (Node `net`/`tls` in tests and local tooling,
 * Cloudflare Workers `connect()` in production), which also makes the full
 * protocol conversation testable with scripted sockets.
 *
 * Protocol flow: EHLO -> (AUTH PLAIN when credentials are configured) ->
 * MAIL FROM -> RCPT TO -> DATA -> QUIT. STARTTLS is negotiated after EHLO when
 * `startTls` is enabled and the transport supports it.
 *
 * Security invariants:
 * - The plaintext token travels only inside the DATA payload destined for the
 *   account owner's mailbox; it is never persisted, logged, or echoed in
 *   error surface of this adapter (errors carry the SMTP reply *code* only).
 * - Credentials are sent only when configured, only over an active TLS
 *   session (secure connection or post-STARTTLS), never in the clear.
 */
export class SmtpError extends Error {
  readonly code = "smtp_delivery_failed" as const;
  readonly retryable = true;
  /** The SMTP verb that failed, e.g. "MAIL FROM". */
  readonly command?: string;
  /** Numeric SMTP reply code (never the payload). */
  readonly replyCode?: number;

  constructor(message: string, options?: { command?: string; replyCode?: number }) {
    super(message);
    this.name = "SmtpError";
    this.command = options?.command;
    this.replyCode = options?.replyCode;
  }
}

/** Minimal socket surface shared by Node net/tls sockets and Worker sockets. */
export interface SmtpSocketLike {
  write(data: string): void;
  end(): void;
  destroy(): void;
  setTimeout(ms: number, callback?: () => void): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
  /** Workers-only: upgrades the connection to TLS in place. */
  startTls?(): unknown;
}

export interface SmtpConnectionOptions {
  host: string;
  port: number;
  secure: boolean;
}

export type SmtpSocketFactory = (
  options: SmtpConnectionOptions,
) => Promise<SmtpSocketLike> | SmtpSocketLike;

export interface SmtpAdapterOptions extends SmtpConfig {
  fromAddress: string;
  /** Injectable for tests; defaults to the environment's native transport. */
  socketFactory?: SmtpSocketFactory;
  /** Socket inactivity timeout in milliseconds. */
  timeoutMs?: number;
}

const CRLF = "\r\n";
const DEFAULT_TIMEOUT_MS = 15_000;

const isNodeRuntime = () => typeof process !== "undefined" && Boolean(process.versions?.node);

/**
 * Native socket factory: Node `net`/`tls` when running under Node (tests,
 * local tooling), Cloudflare Workers `connect()` otherwise.
 */
export async function defaultSmtpSocketFactory(
  options: SmtpConnectionOptions,
): Promise<SmtpSocketLike> {
  if (isNodeRuntime()) {
    const { createConnection } = await import("node:net");
    const { connect: tlsConnect } = await import("node:tls");
    if (options.secure) {
      return tlsConnect({
        host: options.host,
        port: options.port,
        servername: options.host,
        rejectUnauthorized: false,
      }) as unknown as SmtpSocketLike;
    }
    return createConnection({
      host: options.host,
      port: options.port,
    }) as unknown as SmtpSocketLike;
  }

  // Cloudflare Workers: TCP socket from cloudflare:sockets.
  const { connect } = await import("cloudflare:sockets");
  const socket = connect({
    hostname: options.host,
    port: options.port,
    secureTransport: options.secure ? "on" : "starttls",
  });
  return {
    write: (data: string) => socket.write(data),
    end: () => socket.close(),
    destroy: () => socket.close(),
    setTimeout: () => undefined,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      if (event === "timeout") return socket;
      socket.addEventListener(event, (eventData: unknown) => {
        const payload = (eventData as { data?: unknown })?.data ?? eventData;
        listener(payload);
      });
      return socket;
    },
    startTls: () => socket.startTls(),
  } satisfies SmtpSocketLike;
}

interface SmtpReply {
  code: number;
  text: string;
}

/**
 * Reader that assembles SMTP replies from socket data, handling multi-line
 * replies (continuation lines carry "NNN-", the final line "NNN ").
 */
class ReplyStream {
  private buffer = "";
  private readonly waiters: Array<{
    resolve: (reply: SmtpReply) => void;
    reject: (error: Error) => void;
  }> = [];
  private error: Error | null = null;

  constructor(socket: SmtpSocketLike) {
    socket.on("data", (chunk: unknown) => {
      this.buffer += chunkToString(chunk);
      this.drain();
    });
    socket.on("error", (error: unknown) => {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    });
  }

  private drain(): void {
    while (this.waiters.length > 0) {
      const reply = this.extractReply();
      if (reply === null) return;
      this.waiters.shift()!.resolve(reply);
    }
  }

  private extractReply(): SmtpReply | null {
    let code = 0;
    let sawFinal = false;
    const lines: string[] = [];

    while (this.buffer.includes(CRLF)) {
      const index = this.buffer.indexOf(CRLF);
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + CRLF.length);

      const match = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!match) continue;
      if (code === 0) {
        code = Number(match[1]);
      } else if (Number(match[1]) !== code) {
        // Tolerate a stray line from another session; only the code we are
        // waiting on completes the reply.
        continue;
      }
      lines.push(match[3]);
      if (match[2] === " ") {
        sawFinal = true;
        break;
      }
    }

    if (!sawFinal) return null;
    return { code, text: lines.join("\n") };
  }

  next(): Promise<SmtpReply> {
    if (this.error) {
      return Promise.reject(this.error);
    }
    const pending = this.extractReply();
    if (pending) {
      return Promise.resolve(pending);
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  fail(error: Error): void {
    this.error = error;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }
  }
}

function chunkToString(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
  if (chunk instanceof ArrayBuffer) return new TextDecoder().decode(chunk);
  return String(chunk);
}

function base64(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export class SmtpNotificationAdapter implements NotificationAdapter {
  readonly transport = "smtp" as const;

  private readonly config: SmtpAdapterOptions;
  private readonly socketFactory: SmtpSocketFactory;
  private readonly timeoutMs: number;

  constructor(options: SmtpAdapterOptions) {
    this.config = options;
    this.socketFactory = options.socketFactory ?? defaultSmtpSocketFactory;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async deliverVerificationEmail(message: VerificationEmailMessage): Promise<DeliveryReceipt> {
    const { host, port, secure } = this.config;
    const socket = await this.socketFactory({ host, port, secure });
    const replies = new ReplyStream(socket);
    const messageId = `<${crypto.randomUUID()}@stealth.mail>`;

    const withTimeout = <T>(work: Promise<T>, command: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          replies.fail(new SmtpError(`SMTP timed out during ${command}`, { command }));
          socket.destroy();
          reject(new SmtpError(`SMTP timed out during ${command}`, { command }));
        }, this.timeoutMs);
        work.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });

    const expectReply = async (command: string, expected: number[]): Promise<SmtpReply> => {
      const reply = await withTimeout(replies.next(), command);
      if (!expected.includes(reply.code)) {
        throw new SmtpError("SMTP delivery failed", {
          command,
          replyCode: reply.code,
        });
      }
      return reply;
    };

    try {
      await expectReply("connect", [220]);

      // EHLO
      await this.writeLine(socket, `EHLO stealth.mail${CRLF}`);
      await expectReply("EHLO", [250]);

      // STARTTLS upgrade when configured (never AUTH in the clear).
      if (this.config.startTls && !secure && socket.startTls) {
        await this.writeLine(socket, `STARTTLS${CRLF}`);
        await expectReply("STARTTLS", [220]);
        await socket.startTls();
        await this.writeLine(socket, `EHLO stealth.mail${CRLF}`);
        await expectReply("EHLO", [250]);
      }

      if (this.config.username && this.config.password) {
        const credentials = base64(`\u0000${this.config.username}\u0000${this.config.password}`);
        await this.writeLine(socket, `AUTH PLAIN ${credentials}${CRLF}`);
        await expectReply("AUTH", [235]);
      }

      await this.writeLine(socket, `MAIL FROM:<${this.config.fromAddress}>${CRLF}`);
      await expectReply("MAIL FROM", [250]);

      await this.writeLine(socket, `RCPT TO:<${message.to}>${CRLF}`);
      await expectReply("RCPT TO", [250, 251]);

      await this.writeLine(socket, `DATA${CRLF}`);
      await expectReply("DATA", [354]);

      const isPasswordReset = message.purpose === "password_reset";
      const subject = isPasswordReset
        ? "Reset your Hush Mail password"
        : "Verify your Hush Mail account";
      const actionText = isPasswordReset
        ? "Open the link below to reset your password. The link expires on"
        : "Open the link below to verify your account. The link expires on";

      await this.writeLine(
        socket,
        [
          `From: ${this.config.fromAddress}`,
          `To: ${message.to}`,
          `Subject: ${subject}`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: ${messageId}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/plain; charset=utf-8`,
          ``,
          `Welcome to Hush Mail.`,
          ``,
          actionText,
          `${message.expiresAt.toUTCString()}.`,
          ``,
          `${message.verificationUrl}`,
          ``,
          `If you did not request this message, you can safely ignore it.`,
          ``,
          `.`,
        ].join(CRLF) + CRLF,
      );
      await expectReply("DATA", [250]);

      await this.writeLine(socket, `QUIT${CRLF}`);
      await withTimeout(
        replies.next().then(() => undefined),
        "QUIT",
      ).catch(() => undefined);
      socket.end();

      return {
        transport: "smtp",
        accepted: true,
        providerRef: messageId,
        safeTargetReference: await this.sha256Reference(message.to),
      };
    } finally {
      socket.destroy();
    }
  }

  private writeLine(socket: SmtpSocketLike, line: string): void {
    socket.write(line);
  }

  private async sha256Reference(value: string): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return `ref:${value}`;
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    let out = "";
    for (const byte of new Uint8Array(digest)) {
      out += byte.toString(16).padStart(2, "0");
    }
    return out;
  }
}
