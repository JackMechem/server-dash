import { cn } from "@/lib/utils"

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}

const sizeMap = {
  xs: "size-3 border",
  sm: "size-3.5 border-2",
  md: "size-4 border-2",
  lg: "size-5 border-2",
}

function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <span
      data-slot="spinner"
      className={cn(
        "inline-block rounded-full border-current border-t-transparent animate-spin",
        sizeMap[size],
        className
      )}
      aria-label="Loading"
    />
  )
}

export { Spinner }
