import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "accent"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-primary text-primary-foreground shadow-glow-primary": variant === "default",
          "border-transparent bg-secondary text-secondary-foreground shadow-glow-secondary": variant === "secondary",
          "border-transparent bg-accent text-accent-foreground shadow-glow-accent": variant === "accent",
          "border-transparent bg-destructive text-destructive-foreground": variant === "destructive",
          "border-transparent bg-green-500/20 text-green-400 border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.2)]": variant === "success",
          "border-transparent bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]": variant === "warning",
          "text-foreground": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
