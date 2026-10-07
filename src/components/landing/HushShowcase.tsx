import { Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  CircleDot,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Network,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { AmbientBackground } from "@/components/mail/AmbientBackground";

function HushMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
      <path d="M5 7.5 18.5 15v18L5 25.5v-18Z" fill="#7485FF" />
      <path d="m35 7.5-13.5 7.5v18L35 25.5v-18Z" fill="#53E0D0" />
      <path d="m18.5 15 3 1.7v17l-3-1.7V15Z" fill="#AAB6FF" />
    </svg>
  );
}

export function HushShowcase() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden text-foreground">
      <AmbientBackground />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_0%,var(--background)_92%)]" />

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Hush home">
          <HushMark />
          <span className="text-lg font-semibold tracking-[0.2em]">HUSH</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex" aria-label="Main navigation">
          <a className="transition hover:text-foreground" href="#how-it-works">How it works</a>
          <a className="transition hover:text-foreground" href="#stellar">Built on Stellar</a>
          <a className="transition hover:text-foreground" href="#open-source">Open source</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/auth/sign-in" className="hidden rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground sm:inline-flex">
            Sign in
          </Link>
          <Link to="/auth/sign-up" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-0.5">
            Get early access <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12 lg:px-12 lg:pb-32 lg:pt-24">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-2 text-xs font-medium tracking-wide text-primary">
            <span className="size-1.5 rounded-full bg-[#53E0D0] shadow-[0_0_12px_#53E0D0]" />
            PRIVATE MAIL, BUILT ON STELLAR
          </div>
          <h1 className="max-w-[12ch] text-5xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            Your inbox.<br />
            <span className="bg-gradient-to-r from-[#9CA9FF] via-[#7485FF] to-[#53E0D0] bg-clip-text text-transparent">
              Your rules.
            </span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Hush gives you a private mailbox where identity, sender policy, and delivery proof work together. Let trusted people through. Give everyone else a clear path to reach you.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/auth/sign-up" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-0.5">
              Create your mailbox <ArrowRight className="size-4" />
            </Link>
            <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-glass px-6 py-3.5 font-medium transition hover:bg-accent">
              See how it works <ArrowDownRight className="size-4" />
            </a>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2"><LockKeyhole className="size-4 text-[#53E0D0]" /> Encrypted message content</span>
            <span className="inline-flex items-center gap-2"><CircleDot className="size-4 text-primary" /> Stellar-based identity and proofs</span>
          </div>
        </div>

        <ProductPreview />
      </section>

      <section id="how-it-works" className="border-y border-border bg-glass/35">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.22em] text-[#53E0D0]">A BETTER DELIVERY MODEL</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Private by default. Reachable by design.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">Hush makes the rules around your inbox visible and gives senders a verifiable way to follow them.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <StepCard number="01" icon={<Fingerprint />} title="Know who is writing" body="Resolve a sender to a cryptographic identity, so trust can be based on keys and policy instead of a display name." />
            <StepCard number="02" icon={<ShieldCheck />} title="Set the terms" body="Allow known contacts, block unwanted senders, or require verification, approval, or postage before delivery." />
            <StepCard number="03" icon={<Network />} title="Check the proof" body="Keep message content encrypted off-chain while receipts and postage events can be verified through Stellar." />
          </div>
        </div>
      </section>

      <section id="stellar" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:px-12 lg:py-28">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-primary">STELLAR IS PART OF THE PRODUCT</p>
          <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Useful on-chain proofs. Private off-chain messages.</h2>
          <p className="mt-5 max-w-xl leading-7 text-muted-foreground">Hush uses Stellar for identity and verifiable delivery flows. The encrypted message body stays in off-chain storage, while Soroban contracts support postage, policies, receipts, and message lifecycle events.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <TechTag>Stellar accounts</TechTag><TechTag>Soroban contracts</TechTag><TechTag>Encrypted storage</TechTag>
          </div>
        </div>
        <div className="relative rounded-[2rem] border border-border bg-glass p-6 shadow-elegant sm:p-8">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-[#657BFF]/15 blur-3xl" />
          <div className="relative space-y-3">
            <FlowRow icon={<KeyRound />} title="Sender identity" detail="Public keys resolve to a Stellar account" state="verified" />
            <div className="ml-7 h-5 border-l border-dashed border-primary/40" />
            <FlowRow icon={<LockKeyhole />} title="Encrypted envelope" detail="Ciphertext stored outside the chain" state="private" />
            <div className="ml-7 h-5 border-l border-dashed border-primary/40" />
            <FlowRow icon={<WalletCards />} title="Postage and receipt" detail="Contract events provide a verifiable trail" state="anchored" />
          </div>
          <div className="relative mt-6 flex items-center gap-2 rounded-xl border border-[#53E0D0]/20 bg-[#53E0D0]/[0.07] px-4 py-3 text-xs text-[#8BF1DF]">
            <Check className="size-4" /> Message content remains private while delivery state can be checked.
          </div>
        </div>
      </section>

      <section id="open-source" className="mx-5 mb-16 overflow-hidden rounded-[2rem] border border-primary/20 bg-[linear-gradient(115deg,rgb(116_133_255/14%),rgb(83_224_208/7%)_55%,transparent)] sm:mx-8 lg:mx-auto lg:mb-24 lg:max-w-7xl">
        <div className="grid gap-8 px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-[1fr_auto] lg:items-center lg:px-14 lg:py-14">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.22em] text-[#53E0D0]">PUBLIC DEVELOPMENT</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">A working product with room for more builders.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">Hush brings together a React mail client, TypeScript relay and API services, cryptographic messaging, and Soroban contracts. Maintainer scoped work can span Stellar integrations, protocol tooling, accessibility, and contributor documentation.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <a href="https://github.com/Stellar-Mail/stealth" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5">
              Explore the repository <ArrowRight className="size-4" />
            </a>
            <Link to="/auth/sign-up" className="inline-flex items-center justify-center rounded-full border border-border bg-glass px-5 py-3 text-sm font-medium transition hover:bg-accent">
              Try Hush
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-border px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <span className="inline-flex items-center gap-2"><HushMark className="size-5" /> Hush · Private mail on Stellar</span>
        <span>Encrypted off-chain. Verifiable on-chain.</span>
      </footer>
    </main>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[650px] lg:ml-auto">
      <div className="absolute -inset-8 rounded-[3rem] bg-[radial-gradient(ellipse_at_center,rgb(90_116_255/18%),transparent_65%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0c1425] shadow-[0_35px_100px_-38px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.04]">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2"><HushMark className="size-6" /><span className="text-[10px] font-semibold tracking-[0.2em] text-white/90">HUSH</span></div>
          <div className="hidden rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] text-white/35 sm:block">Search messages and people</div>
          <div className="size-6 rounded-full bg-gradient-to-br from-[#7485FF] to-[#53E0D0]" />
        </div>
        <div className="grid min-h-[370px] grid-cols-[118px_1fr] sm:grid-cols-[150px_1fr]">
          <aside className="border-r border-white/[0.07] p-3 sm:p-4">
            <div className="mb-5 rounded-lg bg-primary px-3 py-2 text-[10px] font-semibold text-primary-foreground">＋ Compose</div>
            {[["▣", "Inbox", "6"], ["◇", "Verified", "3"], ["↗", "Requests", "2"], ["◷", "Receipts", "4"]].map(([icon, label, count], i) => (
              <div key={label} className={`mb-1 flex items-center justify-between rounded-lg px-2.5 py-2 text-[10px] ${i === 0 ? "bg-white/[0.08] text-white" : "text-white/45"}`}>
                <span className="flex items-center gap-2"><span className="text-[#53E0D0]">{icon}</span>{label}</span><span>{count}</span>
              </div>
            ))}
            <div className="mt-8 rounded-xl border border-[#53E0D0]/20 bg-[#53E0D0]/[0.06] p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[#75eadb]">Your policy</div>
              <div className="mt-2 text-[10px] leading-4 text-white/55">Known senders arrive. New senders verify first.</div>
            </div>
          </aside>
          <div className="min-w-0 p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between text-[10px] text-white/40"><span>INBOX · 6 MESSAGES</span><span>All mail⌄</span></div>
            <div className="flex min-h-[315px] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
              <div className="border-b border-white/[0.07] p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-[#263767] text-xs font-semibold text-[#b7c2ff]">NR</div>
                  <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-white/90">Nadia Reyes</div><div className="truncate text-[10px] text-white/40">nadia*stellar.example</div></div>
                  <span className="rounded-full border border-[#53E0D0]/20 bg-[#53E0D0]/[0.08] px-2 py-1 text-[9px] text-[#82ecdc]">IDENTITY VERIFIED</span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-white sm:text-lg">Delivery receipt confirmed</h3>
                <p className="mt-2 text-xs leading-5 text-white/50">Your encrypted message was delivered. The receipt is ready to inspect.</p>
              </div>
              <div className="m-4 mt-auto rounded-lg border border-primary/20 bg-primary/[0.07] p-3 sm:m-5 sm:mt-auto">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-[#b5c0ff]"><ShieldCheck className="size-4 text-[#53E0D0]" /> DELIVERY PROOF</div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-white/45"><span>Message content</span><span className="text-white/75">Encrypted</span></div>
                <div className="mt-1.5 flex items-center justify-between gap-3 text-[9px] text-white/45"><span>Receipt status</span><span className="text-[#82ecdc]">Verified on Stellar</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="relative mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur">
        <span className="size-1.5 rounded-full bg-[#53E0D0]" /> Product preview · sample content
      </div>
    </div>
  );
}

function StepCard({ number, icon, title, body }: { number: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-2xl border border-border bg-glass p-6 shadow-elegant">
      <div className="flex items-center justify-between"><span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span><span className="font-mono text-xs text-muted-foreground/60">{number}</span></div>
      <h3 className="mt-7 text-lg font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
    </article>
  );
}

function FlowRow({ icon, title, detail, state }: { icon: React.ReactNode; title: string; detail: string; state: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-background/55 p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div>
      <span className="hidden rounded-full bg-accent px-2.5 py-1 text-[9px] uppercase tracking-wider text-accent-foreground sm:inline-flex">{state}</span>
    </div>
  );
}

function TechTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border bg-glass px-3 py-1.5 text-xs text-muted-foreground">{children}</span>;
}
