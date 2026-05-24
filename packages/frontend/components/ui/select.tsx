"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { IconChevronDown, IconCheck } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  size?: "xs" | "sm" | "default"
  className?: string
  disabled?: boolean
}

function Select({
  value,
  onValueChange,
  options,
  placeholder,
  size = "default",
  className,
  disabled,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const label = options.find((o) => o.value === value)?.label ?? placeholder ?? value

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const menuH = options.length * 32 + 8
    const below = r.bottom + 4 + menuH < window.innerHeight - 8
    setPos({
      top: below ? r.bottom + 4 : r.top - menuH - 4,
      left: r.left,
      width: r.width,
    })
    const close = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open, options.length])

  const sizeClass = {
    xs: "h-6 px-2 text-[11px] gap-1 rounded-md",
    sm: "h-7 px-2.5 text-xs gap-1.5 rounded-lg",
    default: "h-9 px-3 text-sm gap-2 rounded-xl",
  }[size]

  const chevronSize = size === "xs" ? 10 : 12

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center border transition-colors cursor-pointer select-none whitespace-nowrap font-medium",
          "border-border bg-muted/30 text-foreground",
          "hover:bg-muted/60",
          open && "border-primary/40 bg-muted/50",
          disabled && "opacity-50 pointer-events-none",
          sizeClass,
          className
        )}
      >
        <span className="flex-1 text-left">{label}</span>
        <IconChevronDown
          size={chevronSize}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              minWidth: Math.max(pos.width, 100),
              zIndex: 9999,
            }}
            className="bg-card border border-border rounded-xl shadow-xl py-1 overflow-hidden"
          >
            {options.map((opt) => {
              const active = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onValueChange(opt.value)
                    setOpen(false)
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-[7px] text-[13px] transition-colors cursor-pointer",
                    active
                      ? "text-foreground bg-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <span className="flex-1 text-left">{opt.label}</span>
                  {active && <IconCheck size={12} className="shrink-0" />}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}

export { Select }
