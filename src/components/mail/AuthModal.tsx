import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, Lock, User, AlertCircle, CheckCircle2, X, Mail } from "lucide-react";

import { sharedTypedApi as api, ApiClientError, errorLabel } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { formatMailAddress } from "@/features/identity/mail-domain";

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (userData: { userId: string; username: string; email: string }) => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [identifier, setIdentifier] = useState("");
  const [registering, setRegistering] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Stable close handler so the focus trap does not re-arm on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(() => closeRef.current(), []);
  const modalRef = useFocusTrap(open, close);

  // Move focus to the first form field on open, after the trap has mounted.
  useEffect(() => {
    if (!open) return;
    const t = globalThis.setTimeout(() => {
      const first = modalRef.current?.querySelector<HTMLElement>("input, textarea, button");
      first?.focus();
    }, 0);
    return () => globalThis.clearTimeout(t);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registering) {
      if (
        !displayName.trim() ||
        !email.trim() ||
        !username.trim() ||
        !password ||
        !passwordConfirmation
      ) {
        setError("Complete every required field.");
        return;
      }
      if (!acceptedLegal) {
        setError("Please accept the Terms and Privacy Policy.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const registration = await api.auth.register({
          displayName,
          email,
          username,
          password,
          passwordConfirmation,
          termsVersion: "2026-01",
          privacyPolicyVersion: "2026-01",
        });
        await api.auth.login({ identifier: registration.email, password });
        setSuccess(true);
        setLoading(false);
        window.location.assign("/onboarding");
      } catch (caught) {
        if (caught instanceof ApiClientError) {
          setError(errorLabel(caught));
        } else {
          setError("Unable to connect to the registration server. Please try again.");
        }
        setLoading(false);
      }
      return;
    }
    if (!identifier.trim() || !password) {
      setError("Please enter your email/username and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const bundle = await api.auth.login({ identifier, password });

      setSuccess(true);
      setTimeout(() => {
        setLoading(false);
        setSuccess(false);
        onSuccess(bundle.user);
        onClose();
      }, 600);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        if (caught.status === 429) {
          setError("Too many failed login attempts. Please try again later.");
        } else if (caught.status === 403) {
          if (caught.code === "account_suspended") {
            setError("Your account has been suspended. Please contact support.");
          } else if (caught.code === "account_deactivated") {
            setError("Your account is deactivated.");
          } else {
            setError(caught.message || "Access forbidden.");
          }
        } else {
          setError(caught.message || "Invalid email/username or password.");
        }
      } else {
        setError("Unable to connect to login server. Please try again.");
      }
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          aria-hidden="true"
          className="fixed inset-0 bg-overlay/60 backdrop-blur-md"
        />
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative z-[130] w-full max-w-md overflow-hidden rounded-2xl border border-surface-tint/10 bg-surface-panel p-6 text-foreground shadow-2xl outline-none"
        >
          <button
            onClick={close}
            aria-label={registering ? "Close create account" : "Close sign in"}
            className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition hover:bg-surface-tint/10 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-xl font-bold tracking-tight">
                {registering ? "Create your Hush account" : "Sign in to Hush"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {registering
                  ? "No wallet connection is required."
                  : "Enter your credentials to access your mailbox securely."}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {success && !registering && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                role="status"
                className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-status-success dark:text-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Authentication successful! Accessing mailbox...</span>
              </motion.div>
            )}

            {registering && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Full name
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    required
                    className="glow-ring w-full rounded-lg border border-surface-tint/10 bg-surface-tint/[0.04] px-3 py-2.5 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Email address
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-3 h-4 w-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                      className="glow-ring w-full rounded-lg border border-surface-tint/10 bg-surface-tint/[0.04] py-2.5 pl-9 pr-3 text-sm text-foreground"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Hush username
                  </label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    autoComplete="username"
                    required
                    pattern="[a-z0-9_-]{3,30}"
                    className="glow-ring w-full rounded-lg border border-surface-tint/10 bg-surface-tint/[0.04] px-3 py-2.5 text-sm text-foreground"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMailAddress(username || "username")}
                  </p>
                </div>
              </>
            )}
            {!registering && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Email or Username
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={`${formatMailAddress("alice")} or alice_99`}
                    className="glow-ring w-full rounded-lg border border-surface-tint/10 bg-surface-tint/[0.04] py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 transition focus:bg-surface-tint/[0.08]"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="glow-ring w-full rounded-lg border border-surface-tint/10 bg-surface-tint/[0.04] py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 transition focus:bg-surface-tint/[0.08]"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {registering && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    value={passwordConfirmation}
                    onChange={(e) => setPasswordConfirmation(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="glow-ring w-full rounded-lg border border-surface-tint/10 bg-surface-tint/[0.04] px-3 py-2.5 text-sm text-foreground"
                  />
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={acceptedLegal}
                    onChange={(e) => setAcceptedLegal(e.target.checked)}
                    required
                    className="mt-0.5"
                  />
                  I agree to the Terms and Privacy Policy.
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="glow-ring flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  {registering ? "Creating account..." : "Authenticating..."}
                </span>
              ) : registering ? (
                "Create account"
              ) : (
                "Sign In"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setRegistering(!registering);
                setError(null);
                setSuccess(false);
              }}
              className="w-full text-center text-xs text-primary hover:underline"
            >
              {registering ? "Already have an account? Sign in" : "New to Hush? Create an account"}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
