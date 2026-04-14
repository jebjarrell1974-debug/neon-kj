import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatWaitTime(minutes: number): string {
  if (!minutes || minutes <= 0) return "Next Up!";
  const rounded = Math.round(minutes);
  return `~${rounded} min`;
}

export function getEnergyColor(score: number): "destructive" | "warning" | "success" | "default" {
  if (score <= 3) return "destructive";
  if (score <= 6) return "warning";
  if (score <= 10) return "success";
  return "default";
}
