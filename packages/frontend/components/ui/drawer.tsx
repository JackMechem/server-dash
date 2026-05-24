"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { cn } from "@/lib/utils"

const Drawer = DrawerPrimitive.Root
const DrawerTrigger = DrawerPrimitive.Trigger
const DrawerClose = DrawerPrimitive.Close
const DrawerPortal = DrawerPrimitive.Portal

const DrawerBackdrop = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Backdrop
    ref={ref}
    className={cn(
      "fixed inset-0 z-[9500] bg-black/40 backdrop-blur-[2px]",
      "transition-opacity data-open:animate-in data-open:fade-in-0",
      "data-closed:animate-out data-closed:fade-out-0 duration-200",
      className
    )}
    {...props}
  />
))
DrawerBackdrop.displayName = "DrawerBackdrop"

const DrawerPopup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Popup>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Popup
    ref={ref}
    className={cn(
      "fixed bottom-0 left-0 right-0 z-[9501]",
      "mx-auto max-w-[560px] w-full",
      "bg-card text-foreground border border-border border-b-0 rounded-t-2xl shadow-2xl outline-none",
      "transition-transform data-open:animate-in data-open:slide-in-from-bottom",
      "data-closed:animate-out data-closed:slide-out-to-bottom duration-200",
      className
    )}
    {...props}
  />
))
DrawerPopup.displayName = "DrawerPopup"

function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1.5 px-6 pt-6 pb-4", className)} {...props} />
  )
}

function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex justify-end gap-2 px-6 pb-6 pt-2", className)} {...props} />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function DrawerHandle({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center pt-3 pb-1", className)}>
      <div className="w-10 h-1 rounded-full bg-border" />
    </div>
  )
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerPortal,
  DrawerBackdrop,
  DrawerPopup,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerHandle,
}
