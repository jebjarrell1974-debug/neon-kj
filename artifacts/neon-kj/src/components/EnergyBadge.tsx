import { Badge } from "./ui/badge";
import { getEnergyColor } from "@/lib/utils";
import { Flame } from "lucide-react";

export function EnergyBadge({ score, className }: { score: number, className?: string }) {
  const variant = getEnergyColor(score);
  
  let label = "Mid";
  if (score <= 3) label = "Low";
  if (score >= 7) label = "High";

  return (
    <Badge variant={variant === "default" ? "outline" : variant} className={`gap-1 ${className || ''}`}>
      <Flame className="w-3 h-3" />
      <span>{label} Energy ({score})</span>
    </Badge>
  );
}
