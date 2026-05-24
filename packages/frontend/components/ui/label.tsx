"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "block text-[11px] font-semibold text-muted-foreground select-none",
        "peer-disabled:opacity-40 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-40",
        className
      )}
      {...props}
    />
  )
}

export { Label }
