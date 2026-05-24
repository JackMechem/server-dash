"use client"

import * as React from "react"
import { Menubar as MenubarRoot } from "@base-ui/react/menubar"
import { Menu } from "@base-ui/react/menu"
import { IconChevronRight } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

// ── Root bar ──────────────────────────────────────────────────────────────────

const Menubar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof MenubarRoot>
>(({ className, ...props }, ref) => (
  <MenubarRoot
    ref={ref}
    className={cn(
      "flex items-center h-7 px-2 gap-0.5 bg-card text-foreground border-b border-border shrink-0 select-none",
      className
    )}
    {...props}
  />
))
Menubar.displayName = "Menubar"

// ── Menu root (one menu in the bar) ──────────────────────────────────────────

const MenubarMenu = Menu.Root

// ── Trigger button (the label in the bar) ────────────────────────────────────

const MenubarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Menu.Trigger>
>(({ className, ...props }, ref) => (
  <Menu.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center px-2.5 py-1 text-[12px] font-medium rounded-md cursor-pointer select-none transition-colors outline-none",
      "text-foreground-sec hover:text-foreground hover:bg-secondary/60",
      "data-popup-open:bg-secondary/60 data-popup-open:text-foreground",
      className
    )}
    {...props}
  />
))
MenubarTrigger.displayName = "MenubarTrigger"

// ── Portal + Positioner ───────────────────────────────────────────────────────

const MenubarPortal = Menu.Portal

const MenubarPositioner = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Menu.Positioner>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <Menu.Positioner
    ref={ref}
    sideOffset={sideOffset}
    className={cn("z-[9000] outline-none", className)}
    {...props}
  />
))
MenubarPositioner.displayName = "MenubarPositioner"

// ── Popup container ───────────────────────────────────────────────────────────

const MenubarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Menu.Popup>
>(({ className, ...props }, ref) => (
  <Menu.Popup
    ref={ref}
    className={cn(
      "min-w-[160px] bg-card text-foreground border border-border rounded-xl shadow-xl py-1 outline-none",
      "origin-[var(--transform-origin)]",
      "transition-[transform,opacity] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
      "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100",
      className
    )}
    {...props}
  />
))
MenubarContent.displayName = "MenubarContent"

// ── Item ──────────────────────────────────────────────────────────────────────

const MenubarItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Menu.Item>
>(({ className, ...props }, ref) => (
  <Menu.Item
    ref={ref}
    className={cn(
      "w-[calc(100%-8px)] mx-[4px] flex items-center gap-2 px-2.5 py-[5px] text-[13px] rounded-lg cursor-pointer outline-none transition-colors",
      "text-foreground-sec hover:text-foreground hover:bg-secondary/60",
      "data-highlighted:bg-secondary/60 data-highlighted:text-foreground",
      className
    )}
    {...props}
  />
))
MenubarItem.displayName = "MenubarItem"

// ── Separator ─────────────────────────────────────────────────────────────────

function MenubarSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 mx-2 h-px bg-border", className)} />
}

// ── Label (section header) ────────────────────────────────────────────────────

function MenubarLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("px-3 pt-1.5 pb-0.5 text-[11px] font-semibold text-muted-foreground/70 select-none", className)}>
      {children}
    </p>
  )
}

// ── Checkbox item ─────────────────────────────────────────────────────────────

const MenubarCheckboxItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Menu.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <Menu.CheckboxItem
    ref={ref}
    className={cn(
      "w-[calc(100%-8px)] mx-[4px] flex items-center gap-2 px-2.5 py-[5px] text-[13px] rounded-lg cursor-pointer outline-none transition-colors",
      "text-foreground-sec hover:text-foreground hover:bg-secondary/60",
      "data-highlighted:bg-secondary/60 data-highlighted:text-foreground",
      className
    )}
    {...props}
  >
    <span className="w-3.5 h-3.5 rounded border border-border flex items-center justify-center shrink-0">
      <Menu.CheckboxItemIndicator className="w-2 h-2 rounded-[2px] bg-blue" />
    </span>
    {children}
  </Menu.CheckboxItem>
))
MenubarCheckboxItem.displayName = "MenubarCheckboxItem"

// ── Submenu ───────────────────────────────────────────────────────────────────

const MenubarSub = Menu.SubmenuRoot

const MenubarSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Menu.SubmenuTrigger>
>(({ className, children, ...props }, ref) => (
  <Menu.SubmenuTrigger
    ref={ref}
    className={cn(
      "w-[calc(100%-8px)] mx-[4px] flex items-center gap-2 px-2.5 py-[5px] text-[13px] rounded-lg cursor-pointer outline-none transition-colors",
      "text-foreground-sec hover:text-foreground hover:bg-secondary/60",
      "data-highlighted:bg-secondary/60 data-highlighted:text-foreground",
      "data-popup-open:bg-secondary/60 data-popup-open:text-foreground",
      className
    )}
    {...props}
  >
    {children}
    <IconChevronRight size={12} className="ml-auto shrink-0" />
  </Menu.SubmenuTrigger>
))
MenubarSubTrigger.displayName = "MenubarSubTrigger"

const MenubarSubContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Menu.Popup>
>(({ className, ...props }, ref) => (
  <Menu.Popup
    ref={ref}
    className={cn(
      "min-w-[160px] bg-card text-foreground border border-border rounded-xl shadow-xl py-1 outline-none",
      "origin-[var(--transform-origin)]",
      "transition-[transform,opacity] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
      "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100",
      className
    )}
    {...props}
  />
))
MenubarSubContent.displayName = "MenubarSubContent"

// ── Radio group ───────────────────────────────────────────────────────────────

const MenubarRadioGroup = Menu.RadioGroup

const MenubarRadioItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Menu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <Menu.RadioItem
    ref={ref}
    className={cn(
      "w-[calc(100%-8px)] mx-[4px] flex items-center gap-2 px-2.5 py-[5px] text-[13px] rounded-lg cursor-pointer outline-none transition-colors",
      "text-foreground-sec hover:text-foreground hover:bg-secondary/60",
      "data-highlighted:bg-secondary/60 data-highlighted:text-foreground",
      className
    )}
    {...props}
  >
    {/* Dot indicator */}
    <span className="w-3.5 h-3.5 rounded-full border border-border flex items-center justify-center shrink-0">
      <Menu.RadioItemIndicator className="w-1.5 h-1.5 rounded-full bg-blue" />
    </span>
    {children}
  </Menu.RadioItem>
))
MenubarRadioItem.displayName = "MenubarRadioItem"

// ── Shortcut hint ─────────────────────────────────────────────────────────────

function MenubarShortcut({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("ml-auto text-[11px] text-muted-foreground/60 font-mono tracking-widest", className)}>
      {children}
    </span>
  )
}

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarPortal,
  MenubarPositioner,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarLabel,
  MenubarSub,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarCheckboxItem,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarShortcut,
}
