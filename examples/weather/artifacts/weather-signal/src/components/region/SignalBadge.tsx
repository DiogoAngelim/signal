import { cn } from "@/lib/utils";
import type { SignalAction } from "@/types/weather";

const SIGNAL_CONFIG: Record<SignalAction, { label: string; color: string; bg: string; border: string }> = {
  Escalate: {
    label: "Escalate",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca"
  },
  Warn: {
    label: "Warn",
    color: "#c2410c",
    bg: "#fff7ed",
    border: "#fed7aa"
  },
  Watch: {
    label: "Watch",
    color: "#b45309",
    bg: "#fffbeb",
    border: "#fde68a"
  },
  Dispatch: {
    label: "Dispatch",
    color: "#1d4ed8",
    bg: "#eff6ff",
    border: "#bfdbfe"
  },
  Review: {
    label: "Review",
    color: "#0f766e",
    bg: "#f0fdfa",
    border: "#99f6e4"
  },
  Cancel: {
    label: "Cancel",
    color: "#475569",
    bg: "#f8fafc",
    border: "#e2e8f0"
  },
  "Suppress Duplicate": {
    label: "Suppress Duplicate",
    color: "#6b7280",
    bg: "#f9fafb",
    border: "#e5e7eb"
  },
  "No Action": {
    label: "No Action",
    color: "#6b7280",
    bg: "#f9fafb",
    border: "#e5e7eb"
  }
};

interface SignalBadgeProps {
  action: SignalAction;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SignalBadge({ action, className, size = "md" }: SignalBadgeProps) {
  const config = SIGNAL_CONFIG[action];
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-1.5 text-base font-medium"
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium border transition-colors",
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: config.bg,
        color: config.color,
        borderColor: config.border
      }}
    >
      {config.label}
    </span>
  );
}
