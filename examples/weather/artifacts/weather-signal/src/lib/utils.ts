import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { STATUS_CONFIG } from "@/lib/statusConfig"
import type { StatusLevel } from "@/types/weather"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getStatusConfig(status: StatusLevel) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG["Calm"];
}

export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
