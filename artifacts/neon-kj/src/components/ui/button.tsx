import * as React from "react"
import { cn } from "@/lib/utils"
import { motion, HTMLMotionProps } from "framer-motion"

export interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "accent"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-primary text-primary-foreground shadow-glow-primary hover:bg-primary/90": variant === "default",
            "bg-secondary text-secondary-foreground shadow-glow-secondary hover:bg-secondary/90": variant === "secondary",
            "bg-accent text-accent-foreground shadow-glow-accent hover:bg-accent/90": variant === "accent",
            "border border-input bg-background hover:bg-accent/10 hover:text-accent": variant === "outline",
            "hover:bg-accent/10 hover:text-accent": variant === "ghost",
            "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_0_15px_rgba(255,0,0,0.5)]": variant === "destructive",
            "h-10 px-4 py-2": size === "default",
            "h-9 rounded-lg px-3": size === "sm",
            "h-12 rounded-xl px-8 text-base": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
