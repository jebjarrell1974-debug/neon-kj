import React, { useEffect, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

const TOAST_DURATION_MS = 5000

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-[400px] pointer-events-none p-4 sm:p-0">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onDismiss={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({
  title,
  description,
  action,
  className,
  onDismiss,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  onDismiss: () => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, TOAST_DURATION_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={`bg-card/90 backdrop-blur-md border border-border rounded-xl shadow-xl pointer-events-auto ${className || ""}`}
    >
      <div className="relative p-4">
        <button
          onClick={onDismiss}
          aria-label="close notification"
          className="absolute top-2 right-2 z-10 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="grid gap-1 pr-7">
          {title && <div className="font-display font-semibold text-foreground">{title}</div>}
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
        </div>
        {action}
      </div>
    </motion.div>
  )
}
