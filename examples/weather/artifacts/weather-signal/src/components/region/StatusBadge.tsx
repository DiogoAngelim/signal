import { cn, getStatusConfig } from "@/lib/utils";
import type { StatusLevel } from "@/types/weather";

interface StatusBadgeProps {
  status: StatusLevel;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function StatusBadge({ status, className, size = "md" }: StatusBadgeProps) {
  const config = getStatusConfig(status);

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-1.5 text-base font-medium",
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
        borderColor: config.border,
      }}
    >
      {config.label}
    </span>
  );
}