import { Sparkles } from "lucide-react";

import type { Email } from "./data";
import { cn } from "@/lib/utils";

type SenderAvatarSize = "sm" | "md" | "lg";

const sizeClasses: Record<SenderAvatarSize, string> = {
  sm: "h-7 w-7 text-[9px]",
  md: "h-[30px] w-[30px] text-[10px]",
  lg: "h-9 w-9 text-[11px]",
};

export function SenderAvatar({
  email,
  size = "sm",
  unread = false,
  className,
}: {
  email: Email;
  size?: SenderAvatarSize;
  unread?: boolean;
  className?: string;
}) {
  const initials = email.from
    .split(/\s+/)
    .map((name) => name[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full text-white/95 ring-1 ring-surface-tint/15 shadow-[0_8px_18px_-12px_rgba(0,0,0,0.9)]",
        sizeClasses[size],
        className,
      )}
      style={{
        background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.3), transparent 25%), linear-gradient(135deg, ${email.avatarColor}, #1a1a1d 88%)`,
      }}
      aria-label={`${email.from} avatar`}
    >
      <Sparkles className="absolute h-[58%] w-[58%] opacity-25" aria-hidden />
      <span className="relative font-semibold tracking-tight">{initials}</span>
      <img
        src={`https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
          email.from,
        )}&backgroundColor=1a1a1d`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
      {unread ? (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-highlight ring-2 ring-background" />
      ) : null}
    </div>
  );
}
