import { cn } from "@/lib/utils"

interface StatusDotProps {
  status: "online" | "offline" | "warning" | "on" | "off"
  pulse?: boolean
  size?: "sm" | "md"
  className?: string
}

const colorMap = {
  online:  "bg-green",
  on:      "bg-green",
  offline: "bg-muted-foreground/40",
  off:     "bg-muted-foreground/40",
  warning: "bg-amber-400",
}

function StatusDot({ status, pulse, size = "sm", className }: StatusDotProps) {
  const isActive = status === "online" || status === "on"
  return (
    <span
      data-slot="status-dot"
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "sm" ? "size-1.5" : "size-2",
        colorMap[status],
        (pulse ?? isActive) && "animate-[pulse-dot_2s_ease-in-out_infinite]",
        className
      )}
    />
  )
}

export { StatusDot }
