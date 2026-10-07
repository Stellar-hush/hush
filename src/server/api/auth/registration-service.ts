import type { RegistrationRequest, RegistrationResponse } from "@/features/identity/registration";
import { maskEmail } from "@/features/identity/registration";
import { loadRuntimeConfig } from "@/config";
import type { ApiContext } from "../context";
import type { Credential, Profile, User } from "../domain";
import { ApiError } from "../errors";
import { hashPassword } from "./password";
import { provisionManagedStellarWallet } from "../account-provisioning";
import { prepareManagedWalletSecret } from "@/services/stellar/account-provision";
import { createFundingAdapter } from "@/services/stellar/funding-adapter";
import {
  checkIpLimit,
  checkEmailDomainLimit,
  checkInviteCode,
  checkUsernameReservationLimit,
} from "../abuse-service";
import { recordAuditEvent } from "../audit";
import { enforceCapability } from "@/server/api/beta-controls/guard";
import { getBetaControlService } from "@/server/api/beta-controls";

const SIGNUP_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const MAX_SIGNUPS_PER_IP = 10;

export async function registerWithPassword(
  apiContext: ApiContext,
  input: RegistrationRequest,
  ip = "unknown",
  deviceFingerprint = "unknown",
  options?: {
    inviteCodeRequired?: boolean;
    validInviteCodes?: string[];
  },
): Promise<RegistrationResponse> {
  // BETA-079: Layered abuse controls for registration

  // 1. IP rate limiting
  const ipCheck = await checkIpLimit(
    apiContext.repository,
    ip,
    "registration",
    5,
    SIGNUP_RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!ipCheck.allowed) {
    throw new ApiError(429, "too_many_requests", "Registration rate limit exceeded for IP", {
      retryAfterSeconds: ipCheck.retryAfterSeconds ?? SIGNUP_RATE_LIMIT_WINDOW_SECONDS,
    });
  }

  // BETA-095: operator kill switch for signup. Fails closed if the control
  // store is unavailable (no signups until the control is reachable).
  await enforceCapability("signup");

  // Reserve the user id up front so it can be used as the audit actor for the
  // invite redemption that happens before the account row is written.
  const now = new Date();
  const nowIso = now.toISOString();
  const userId = `usr_${crypto.randomUUID().replace(/-/g, "")}`;

  // BETA-095: when an invite code is supplied it is redeemed *before* the
  // account is created, inside the store's serialized mutex. This makes invite
  // redemption and account creation effectively atomic: a duplicate concurrent
  // registration fails the (already-claimed) invite instead of creating a
  // dangling account that consumed the email/username without owning the invite.
  let redeemedInvite: string | null = null;
  if (input.inviteCode && input.inviteCode.trim().length > 0) {
    try {
      redeemedInvite = input.inviteCode.trim();
      await getBetaControlService().redeemInvite(redeemedInvite, userId);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      recordAuditEvent({
        actor: userId,
        action: "auth.invite_redeem_failed",
        targetType: "account",
        safeTargetReference: userId,
        result: "denied",
        requestId: apiContext.requestId ?? "registration",
      });
      throw new ApiError(
        400,
        "invite_invalid",
        "The supplied beta invite code could not be redeemed.",
      );
    }
  }

  const { hash, salt } = await hashPassword(input.password);

  const config = loadRuntimeConfig();
  const storageSecret = config.secrets?.storageSecret ?? "dev-storage-secret-change-me";
  const prepared = await prepareManagedWalletSecret({
    userId,
    storageSecret,
    now,
  });

  const user: User = {
    userId,
    address: prepared.address,
    email: input.email,
    username: input.username,
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  };
  const credential: Credential = {
    credentialId: `cred_${crypto.randomUUID().replace(/-/g, "")}`,
    userId,
    authMethod: "password_hash",
    secretHash: `${hash}:${salt}`,
    walletKeyRef: `pending_${userId}`,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const profile: Profile = {
    userId,
    username: input.username,
    displayName: input.displayName,
    locale: "en-US",
    timezone: "UTC",
    addressDisplay: "full",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    await apiContext.repository.createUser(user, credential, profile);
  } catch (error) {
    // Roll back the invite redemption so the code can be retried on a
    // successful registration rather than being permanently consumed by a
    // failed one.
    if (redeemedInvite) {
      try {
        await getBetaControlService().releaseInviteRedemption(redeemedInvite, userId);
      } catch {
        // Best-effort rollback; the audit trail still records the failure below.
      }
    }
    if (error instanceof ApiError && error.code === "conflict") {
      throw new ApiError("conflict");
    }
    throw error;
  }

  await provisionManagedStellarWallet(apiContext.repository, userId, config, {
    fundingAdapter: createFundingAdapter({
      useFake: config.profile === "development" || config.profile === "test",
    }),
    storageSecret,
    now,
    prepared,
    accountId: userId,
    origin: ip,
  });

  // Hush is a self-contained mail protocol: there is no external mailbox
  // to confirm. Registration activates the account immediately.

  return {
    accountStatus: "active",
    email: user.email,
    maskedEmail: maskEmail(user.email),
    username: user.username,
  };
}
