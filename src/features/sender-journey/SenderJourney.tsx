import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Coins,
  Send,
  HelpCircle,
  RefreshCw,
  Home,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_JOURNEY_STATE, type JourneyState, type JourneyStage } from "./types";

function AddressStep({
  state,
  update,
  next,
}: {
  state: JourneyState;
  update: (patch: Partial<JourneyState>) => void;
  next: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          Who would you like to send a message to?
        </h3>
        <p className="text-xs text-muted-foreground">
          Enter a Hush address, Stellar address, or federation address (name*domain)
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Recipient address
        </label>
        <input
          type="text"
          placeholder="recipient*domain.com"
          value={state.recipientAddress}
          onChange={(e) => update({ recipientAddress: e.target.value })}
          className="w-full rounded-lg border border-surface-tint/10 bg-surface-recessed/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>
      <button
        onClick={next}
        disabled={state.recipientAddress.trim().length === 0}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition",
          state.recipientAddress.trim().length > 0
            ? "bg-emerald-500 text-black hover:opacity-90"
            : "cursor-not-allowed bg-surface-tint/5 text-muted-foreground",
        )}
      >
        Continue
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function QuoteStep({
  state,
  update,
  next,
  back,
}: {
  state: JourneyState;
  update: (patch: Partial<JourneyState>) => void;
  next: () => void;
  back: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Message postage</h3>
        <p className="text-xs text-muted-foreground">
          Review the postage required and our refund policy before you continue.
        </p>
      </div>

      <div className="rounded-xl border border-surface-tint/10 bg-surface-recessed/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Recipient</span>
          <span className="text-xs font-mono text-foreground">{state.recipientAddress}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Postage</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={state.postageAmount}
              onChange={(e) => update({ postageAmount: e.target.value })}
              className="w-24 rounded border border-surface-tint/10 bg-surface-recessed/30 px-2 py-1 text-sm font-mono text-foreground"
            />
            <span className="text-xs text-foreground">XLM</span>
          </div>
        </div>
        <div className="border-t border-surface-tint/10 pt-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-status-success dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>Refund policy:</strong> If the recipient blocks your message or refunds your
              postage, the full amount will be returned to your wallet within 24 hours.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={back}
          className="flex-1 rounded-lg border border-surface-tint/10 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-tint/5"
        >
          Back
        </button>
        <button
          onClick={next}
          className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function IdentityStep({ next, back }: { next: () => void; back: () => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Quick identity check</h3>
        <p className="text-xs text-muted-foreground">
          No crypto knowledge needed! We&apos;ll just verify you&apos;re a real sender.
        </p>
      </div>

      <div className="rounded-xl border border-surface-tint/10 bg-surface-recessed/20 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <ShieldCheck className="h-4 w-4 text-status-success dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Identity confirmed</p>
            <p className="text-[11px] text-muted-foreground">Your wallet signature verifies you</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={back}
          className="flex-1 rounded-lg border border-surface-tint/10 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-tint/5"
        >
          Back
        </button>
        <button
          onClick={next}
          className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:opacity-90"
        >
          Compose message
        </button>
      </div>
    </div>
  );
}

function PaymentStep({
  state,
  update,
  next,
  back,
}: {
  state: JourneyState;
  update: (patch: Partial<JourneyState>) => void;
  next: () => void;
  back: () => void;
}) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);

  const handleSimulatePayment = () => {
    setIsSimulating(true);
    update({ paymentStatus: "pending" });

    setTimeout(() => {
      if (simulateFailure) {
        update({ paymentStatus: "failed" });
      } else {
        update({ paymentStatus: "success" });
        setTimeout(next, 800);
      }
      setIsSimulating(false);
    }, 1500);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Compose your message</h3>
        <p className="text-xs text-muted-foreground">Write your message and confirm payment.</p>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Subject
        </label>
        <input
          type="text"
          placeholder="Quick question..."
          value={state.subject}
          onChange={(e) => update({ subject: e.target.value })}
          className="w-full rounded-lg border border-surface-tint/10 bg-surface-recessed/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Message
        </label>
        <textarea
          placeholder="Hi there, I'd love to connect..."
          value={state.body}
          onChange={(e) => update({ body: e.target.value })}
          rows={5}
          className="w-full rounded-lg border border-surface-tint/10 bg-surface-recessed/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      <div className="rounded-xl border border-surface-tint/10 bg-surface-recessed/20 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-status-warning dark:text-amber-400" />
            <span className="text-xs font-semibold text-foreground">
              {state.postageAmount} XLM postage
            </span>
          </div>
          {state.paymentStatus === "success" && (
            <div className="flex items-center gap-1 text-status-success dark:text-emerald-400">
              <Check className="h-4 w-4" />
              <span className="text-xs font-semibold">Paid</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
              className="rounded border-surface-tint/20 bg-surface-recessed/40 text-status-success dark:text-emerald-500 focus:ring-emerald-500/30 focus:outline-none"
            />
            Simulate payment failure
          </label>
        </div>
      </div>

      {state.paymentStatus === "failed" && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-xs text-status-danger dark:text-red-200 mb-2">
            Payment failed. Please check your wallet balance and try again.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => update({ paymentStatus: "idle" })}
              className="flex-1 rounded-lg border border-surface-tint/10 px-4 py-2 text-xs font-semibold text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSimulatePayment}
              disabled={isSimulating}
              className="flex-1 rounded-lg bg-rose-500 px-4 py-2 text-xs font-semibold text-black flex items-center justify-center gap-2"
            >
              {isSimulating ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Retry payment
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={back}
          className="flex-1 rounded-lg border border-surface-tint/10 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-tint/5"
        >
          Back
        </button>
        {state.paymentStatus !== "success" && (
          <button
            onClick={handleSimulatePayment}
            disabled={isSimulating || !state.subject || !state.body}
            className={cn(
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition",
              isSimulating || !state.subject || !state.body
                ? "cursor-not-allowed bg-surface-tint/5 text-muted-foreground"
                : "bg-emerald-500 text-black hover:opacity-90",
            )}
          >
            {isSimulating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Send message
                <Send className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function DeliveryStep({
  state,
  update,
  next,
}: {
  state: JourneyState;
  update: (patch: Partial<JourneyState>) => void;
  next: () => void;
}) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);

  const handleSimulateDelivery = () => {
    setIsSimulating(true);
    update({ deliveryStatus: "pending" });

    setTimeout(() => {
      if (simulateFailure) {
        update({ deliveryStatus: "failed" });
      } else {
        update({ deliveryStatus: "delivered" });
      }
      setIsSimulating(false);
    }, 1500);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Delivery status</h3>
        <p className="text-xs text-muted-foreground">
          Track your message as it reaches the recipient.
        </p>
      </div>

      <div className="rounded-xl border border-surface-tint/10 bg-surface-recessed/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Subject</span>
          <span className="text-xs font-semibold text-foreground">{state.subject}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Status</span>
          <span
            className={cn(
              "text-xs font-semibold",
              state.deliveryStatus === "delivered"
                ? "text-status-success dark:text-emerald-400"
                : state.deliveryStatus === "failed"
                  ? "text-status-danger dark:text-rose-400"
                  : state.deliveryStatus === "pending"
                    ? "text-status-info dark:text-blue-400"
                    : "text-muted-foreground",
            )}
          >
            {state.deliveryStatus === "delivered"
              ? "Delivered"
              : state.deliveryStatus === "failed"
                ? "Failed"
                : state.deliveryStatus === "pending"
                  ? "Sending..."
                  : "Ready"}
          </span>
        </div>

        {state.deliveryStatus === "idle" && (
          <div className="mt-3 flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.checked)}
                className="rounded border-surface-tint/20 bg-surface-recessed/40 text-status-success dark:text-emerald-500 focus:ring-emerald-500/30 focus:outline-none"
              />
              Simulate delivery failure
            </label>
          </div>
        )}
      </div>

      {state.deliveryStatus === "failed" && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-xs text-status-danger dark:text-red-200 mb-2">
            Delivery failed. The recipient may be unavailable or have blocked unknown senders.
          </p>
          <button
            onClick={next}
            className="w-full rounded-lg bg-rose-500 px-4 py-2 text-xs font-semibold text-black"
          >
            Request refund
          </button>
        </div>
      )}

      {state.deliveryStatus === "delivered" && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              update({ ...DEFAULT_JOURNEY_STATE });
            }}
            className="flex-1 rounded-lg border border-surface-tint/10 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-tint/5 flex items-center justify-center gap-2"
          >
            <Home className="h-4 w-4" />
            Send another
          </button>
        </div>
      )}

      {state.deliveryStatus === "idle" && (
        <button
          onClick={handleSimulateDelivery}
          disabled={isSimulating}
          className={cn(
            "w-full rounded-lg px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition",
            isSimulating
              ? "cursor-not-allowed bg-surface-tint/5 text-muted-foreground"
              : "bg-emerald-500 text-black hover:opacity-90",
          )}
        >
          {isSimulating ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Delivering...
            </>
          ) : (
            <>
              Check delivery
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

function RefundStep({ update }: { update: (patch: Partial<JourneyState>) => void }) {
  const [refunded, setRefunded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRefund = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setRefunded(true);
      setIsProcessing(false);
    }, 1500);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Postage refund</h3>
        <p className="text-xs text-muted-foreground">Request a refund for your message postage.</p>
      </div>

      {!refunded ? (
        <>
          <div className="rounded-xl border border-surface-tint/10 bg-surface-recessed/20 p-4">
            <p className="text-xs text-muted-foreground">
              Your postage will be returned to your wallet within 24 hours of processing.
            </p>
          </div>
          <button
            onClick={handleRefund}
            disabled={isProcessing}
            className={cn(
              "w-full rounded-lg px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition",
              isProcessing
                ? "cursor-not-allowed bg-surface-tint/5 text-muted-foreground"
                : "bg-amber-500 text-black hover:opacity-90",
            )}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Processing refund...
              </>
            ) : (
              "Request refund"
            )}
          </button>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <Check className="h-4 w-4 text-status-success dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Refund requested!</p>
              <p className="text-[11px] text-muted-foreground">
                Your XLM will be returned shortly.
              </p>
            </div>
          </div>
          <button
            onClick={() => update({ ...DEFAULT_JOURNEY_STATE })}
            className="w-full rounded-lg border border-surface-tint/10 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-tint/5 flex items-center justify-center gap-2"
          >
            <Home className="h-4 w-4" />
            Start over
          </button>
        </>
      )}
    </div>
  );
}

const STAGE_ORDER: JourneyStage[] = [
  "address",
  "quote",
  "identity",
  "payment",
  "delivery",
  "refund",
];
const STAGE_LABELS: Record<JourneyStage, string> = {
  address: "Address",
  quote: "Quote",
  identity: "Identity",
  payment: "Payment",
  delivery: "Delivery",
  refund: "Refund",
};

export function SenderJourney() {
  const [state, setState] = useState<JourneyState>(DEFAULT_JOURNEY_STATE);

  const currentIndex = STAGE_ORDER.indexOf(state.stage);

  const goToNext = () => {
    const nextStage = STAGE_ORDER[currentIndex + 1];
    if (nextStage) {
      setState((s) => ({ ...s, stage: nextStage }));
    }
  };

  const goToPrevious = () => {
    const prevStage = STAGE_ORDER[currentIndex - 1];
    if (prevStage) {
      setState((s) => ({ ...s, stage: prevStage }));
    }
  };

  const updateState = (patch: Partial<JourneyState>) => {
    setState((s) => ({ ...s, ...patch }));
  };

  return (
    <div className="min-h-screen bg-surface-recessed/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="flex items-center justify-between gap-1 mb-6">
          {STAGE_ORDER.map((stage, index) => {
            const isActive = stage === state.stage;
            const isCompleted = index < currentIndex;

            return (
              <div key={stage} className="flex items-center gap-1 flex-1">
                <div
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    isActive || isCompleted ? "bg-emerald-500" : "bg-surface-tint/10",
                  )}
                />
              </div>
            );
          })}
        </div>

        <div className="glass-strong rounded-2xl border border-surface-tint/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Send a message</h2>
            <div className="flex items-center gap-1">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={state.stage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {state.stage === "address" && (
                <AddressStep state={state} update={updateState} next={goToNext} />
              )}
              {state.stage === "quote" && (
                <QuoteStep state={state} update={updateState} next={goToNext} back={goToPrevious} />
              )}
              {state.stage === "identity" && <IdentityStep next={goToNext} back={goToPrevious} />}
              {state.stage === "payment" && (
                <PaymentStep
                  state={state}
                  update={updateState}
                  next={goToNext}
                  back={goToPrevious}
                />
              )}
              {state.stage === "delivery" && (
                <DeliveryStep state={state} update={updateState} next={goToNext} />
              )}
              {state.stage === "refund" && <RefundStep update={updateState} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-center gap-1 text-[10px] text-muted-foreground/60">
          <span>
            Stage {currentIndex + 1} of {STAGE_ORDER.length}
          </span>
          <span>•</span>
          <span>{STAGE_LABELS[state.stage]}</span>
        </div>
      </div>
    </div>
  );
}
