"use client"

import * as React from "react"
import { Button } from "./button"
import { motion, AnimatePresence } from "framer-motion"

interface ConfettiButtonProps {
  label?: string
  onClick?: () => void
  className?: string
  variant?: "default" | "secondary" | "primary"
  size?: "sm" | "md" | "lg"
  disabled?: boolean
}

interface ConfettiParticle {
  id: number
  rotate: number
  color: string
}

const colors = ["#facc15", "#22c55e", "#3b82f6", "#f472b6", "#f97316"]

export default function ConfettiButton({
  label = "Submit",
  onClick,
  className,
  variant = "default",
  size = "md",
  disabled = false,
}: ConfettiButtonProps) {
  const [particles, setParticles] = React.useState<ConfettiParticle[]>([])
  const buttonRef = React.useRef<HTMLButtonElement | null>(null)
  const [buttonWidth, setButtonWidth] = React.useState(0)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
    if (buttonRef.current) setButtonWidth(buttonRef.current.offsetWidth)
  }, [buttonRef.current])

  const fireConfetti = () => {
    console.log('[CONFETTI] fireConfetti called', { hasOnClick: !!onClick, buttonRef: buttonRef.current });
    
    const newParticles: ConfettiParticle[] = Array.from({ length: 20 }).map((_, i) => ({
      id: Date.now() + i,
      rotate: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))
    setParticles(newParticles)
    
    // Call onClick prop if provided, or dispatch custom event
    if (onClick) {
      console.log('[CONFETTI] Calling onClick prop');
      onClick()
    } else {
      console.log('[CONFETTI] Dispatching confettiButtonClick event');
      // Dispatch custom event for external handlers - dispatch on button and parent wrapper
      const event = new CustomEvent('confettiButtonClick', { bubbles: true, cancelable: true })
      if (buttonRef.current) {
        console.log('[CONFETTI] Dispatching event on button', buttonRef.current);
        buttonRef.current.dispatchEvent(event)
        // Also dispatch on parent wrapper in case button listener isn't set up
        const wrapper = buttonRef.current.closest('.btn-approval-confirm') || 
                       buttonRef.current.closest('[id*="confetti"]')?.parentElement ||
                       buttonRef.current.parentElement
        if (wrapper) {
          console.log('[CONFETTI] Also dispatching event on wrapper', wrapper);
          wrapper.dispatchEvent(event)
        } else {
          console.warn('[CONFETTI] No wrapper found to dispatch event on');
        }
      } else {
        console.error('[CONFETTI] buttonRef.current is null, cannot dispatch event');
      }
    }
    
    setTimeout(() => setParticles([]), 800)
  }

  // SSR fallback - return button without animations
  if (!isMounted) {
    return (
      <Button
        className={className || ""}
        onClick={fireConfetti}
        variant={variant}
        size={size}
        disabled={disabled}
      >
        {String(label || "Submit")}
      </Button>
    );
  }

  // Client-side rendering with confetti animations
  return (
    <div className="relative inline-block">
      <Button
        ref={buttonRef}
        className={`relative overflow-hidden ${className || ""}`}
        onClick={fireConfetti}
        variant={variant}
        size={size}
        disabled={disabled}
      >
        {String(label || "Submit")}
      </Button>

      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute w-2 h-2 rounded-full bottom-0"
            style={{
              backgroundColor: p.color,
              left: buttonWidth / 2,
              transform: "translateX(-50%)",
            }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: p.rotate }}
            animate={{
              x: (Math.random() - 0.5) * 100,
              y: -Math.random() * 100,
              scale: 0,
              opacity: 0,
              rotate: p.rotate + Math.random() * 360,
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

