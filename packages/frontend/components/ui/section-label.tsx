import { cn } from "@/lib/utils"

interface SectionLabelProps {
  children: React.ReactNode
  divider?: boolean
  className?: string
}

function SectionLabel({ children, divider = false, className }: SectionLabelProps) {
  if (divider) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
          {children}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
    )
  }
  return (
    <p
      data-slot="section-label"
      className={cn(
        "text-[11px] font-semibold text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  )
}

export { SectionLabel }
