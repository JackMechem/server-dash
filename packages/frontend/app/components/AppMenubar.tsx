"use client";

import { useState, useEffect } from "react";
import {
  Menubar, MenubarMenu, MenubarTrigger, MenubarPortal, MenubarPositioner,
  MenubarContent, MenubarItem, MenubarSeparator, MenubarLabel,
  MenubarSub, MenubarSubTrigger, MenubarSubContent, MenubarShortcut,
  MenubarRadioGroup, MenubarRadioItem, MenubarCheckboxItem,
} from "@/components/ui/menubar";
import {
  Drawer, DrawerPortal, DrawerBackdrop, DrawerPopup,
  DrawerHandle, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription, DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useFocusedWindowState } from "@/stores/windowStore";
import { PANEL_LABELS, type PanelId } from "@/app/components/windows/types";
import { useKeybindOS, setKeybindOS, fmtShortcut, type KeybindOS } from "@/stores/keybindStore";
import {
  IconDownload, IconFileTypeCsv, IconFileTypeJs, IconCheck,
  IconBrandWindows, IconBrandApple, IconKeyboard, IconLogin, IconTerminal2,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// ── Export helpers ────────────────────────────────────────────────────────────

type ExportFormat = "csv" | "json";

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const body = rows.map((r) =>
    keys.map((k) => {
      const v = r[k];
      const s = v === null || v === undefined ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(",")
  );
  return [header, ...body].join("\n");
}

async function fetchAndExport(panelId: PanelId, format: ExportFormat): Promise<void> {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const slug = panelId.replace(/[^a-z0-9]+/g, "-");
  const filename = `server-dash-${slug}-${ts}.${format}`;

  if (
    panelId === "analytics-past" ||
    panelId === "analytics-live" ||
    panelId === "summary-cost" ||
    panelId === "summary-power" ||
    panelId === "summary-energy"
  ) {
    const hours = panelId === "analytics-live" ? 1 : 24;
    const res = await fetch(`/api/power/history?hours=${hours}`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const history: { ts: string; devices: { name: string; watts: number; on: boolean; today_wh: number; month_wh: number }[] }[] = await res.json();

    if (format === "json") {
      downloadBlob(JSON.stringify(history, null, 2), filename, "application/json");
    } else {
      const rows = history.flatMap((entry) =>
        entry.devices.map((d) => ({
          timestamp: entry.ts,
          device: d.name,
          watts: d.watts,
          on: d.on,
          today_wh: d.today_wh,
          month_wh: d.month_wh,
        }))
      );
      downloadBlob(toCSV(rows), filename, "text/csv");
    }
    return;
  }

  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const stats = await res.json();

  if (format === "json") {
    downloadBlob(JSON.stringify(stats, null, 2), filename, "application/json");
  } else {
    const rows: Record<string, unknown>[] = [
      {
        timestamp: stats.timestamp,
        cpu_percent: stats.cpu?.percent,
        cpu_model: stats.cpu?.model,
        cpu_cores: stats.cpu?.cores,
        memory_total_mb: stats.memory?.total,
        memory_used_mb: stats.memory?.used,
        memory_percent: stats.memory?.percent,
        disk_total_gb: stats.disk ? (stats.disk.total / 1024).toFixed(1) : "",
        disk_used_gb: stats.disk ? (stats.disk.used / 1024).toFixed(1) : "",
        disk_percent: stats.disk?.percent,
        temperature_c: stats.temperature ?? "",
        uptime_days: stats.uptime?.days,
        uptime_hours: stats.uptime?.hours,
        uptime_minutes: stats.uptime?.minutes,
        load_1m: stats.loadAvg?.["1m"],
        load_5m: stats.loadAvg?.["5m"],
        load_15m: stats.loadAvg?.["15m"],
      },
    ];
    downloadBlob(toCSV(rows), filename, "text/csv");
  }
}

// ── Export Drawer ─────────────────────────────────────────────────────────────

export function ExportDrawer({
  open,
  onOpenChange,
  panelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelId: PanelId | null;
}) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const panelLabel = panelId ? PANEL_LABELS[panelId] : "—";

  const isPowerPanel =
    panelId === "analytics-past" ||
    panelId === "analytics-live" ||
    panelId === "summary-cost" ||
    panelId === "summary-power" ||
    panelId === "summary-energy";

  const description = isPowerPanel
    ? "Exports device power readings as a flat table. Each row is one device at one timestamp."
    : "Exports the current system snapshot including CPU, memory, disk, network, and uptime.";

  async function handleDownload() {
    if (!panelId) return;
    setLoading(true);
    setDone(false);
    try {
      await fetchAndExport(panelId, format);
      setDone(true);
      setTimeout(() => {
        onOpenChange(false);
        setDone(false);
      }, 800);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPortal>
        <DrawerBackdrop />
        <DrawerPopup>
          <DrawerHandle />
          <DrawerHeader>
            <DrawerTitle>Export Data</DrawerTitle>
            <DrawerDescription>
              Active view: <span className="text-foreground font-medium">{panelLabel}</span>
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-6 pb-4 flex flex-col gap-4">
            <p className="text-[13px] text-muted-foreground leading-relaxed">{description}</p>

            <div>
              <p className="text-xs font-medium text-foreground mb-2">File format</p>
              <div className="flex gap-2">
                {(["csv", "json"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={cn(
                      "flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border text-[13px] font-medium cursor-pointer transition-colors",
                      format === f
                        ? "bg-blue/12 border-blue/30 text-blue"
                        : "bg-secondary/30 border-secondary text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    {f === "csv" ? <IconFileTypeCsv size={16} /> : <IconFileTypeJs size={16} />}
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DrawerFooter>
            <DrawerClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DrawerClose>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={loading || done}
              className="gap-1.5"
            >
              {loading ? (
                <><Spinner size="xs" /> Fetching…</>
              ) : done ? (
                <><IconCheck size={14} /> Downloaded</>
              ) : (
                <><IconDownload size={14} /> Download</>
              )}
            </Button>
          </DrawerFooter>
        </DrawerPopup>
      </DrawerPortal>
    </Drawer>
  );
}

// ── Keybind OS options ────────────────────────────────────────────────────────

const OS_OPTIONS: { value: KeybindOS; label: string; icon: React.ElementType }[] = [
  { value: "linux", label: "Linux / Windows", icon: IconBrandWindows },
  { value: "mac",   label: "macOS",           icon: IconBrandApple  },
];

// ── System login setting ──────────────────────────────────────────────────────

function useSystemLogin() {
  const [value, setValue] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setValue(d.allow_system_login ?? false); })
      .catch(() => {});
  }, []);

  async function toggle() {
    if (value === null || saving) return;
    setSaving(true);
    const next = !value;
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allow_system_login: next }),
    });
    if (res.ok) setValue(next);
    setSaving(false);
  }

  return { value, toggle };
}

// ── AppMenubar ────────────────────────────────────────────────────────────────

interface AppMenubarProps {
  isAuthed?: boolean;
  devConsoleOpen?: boolean;
  onToggleDevConsole?: () => void;
}

export function AppMenubar({ isAuthed, devConsoleOpen, onToggleDevConsole }: AppMenubarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const { panelId } = useFocusedWindowState();
  const keybindOS = useKeybindOS();
  const { value: systemLogin, toggle: toggleSystemLogin } = useSystemLogin();

  return (
    <>
      <Menubar className="hidden lg:flex">

        {/* ── File ── */}
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarPortal>
            <MenubarPositioner>
              <MenubarContent>
                <MenubarSub>
                  <MenubarSubTrigger>Export Data</MenubarSubTrigger>
                  <MenubarPortal>
                    <MenubarPositioner>
                      <MenubarSubContent>
                        <MenubarItem onClick={() => setExportOpen(true)}>
                          Active Window
                          <MenubarShortcut>{fmtShortcut("E", keybindOS)}</MenubarShortcut>
                        </MenubarItem>
                      </MenubarSubContent>
                    </MenubarPositioner>
                  </MenubarPortal>
                </MenubarSub>
              </MenubarContent>
            </MenubarPositioner>
          </MenubarPortal>
        </MenubarMenu>

        {/* ── Settings ── */}
        <MenubarMenu>
          <MenubarTrigger>Settings</MenubarTrigger>
          <MenubarPortal>
            <MenubarPositioner>
              <MenubarContent className="min-w-[200px]">
                <MenubarLabel>
                  <span className="flex items-center gap-1.5">
                    <IconLogin size={10} />
                    System
                  </span>
                </MenubarLabel>
                {systemLogin !== null && (
                  <MenubarCheckboxItem
                    checked={systemLogin}
                    onCheckedChange={toggleSystemLogin}
                  >
                    Allow system login
                  </MenubarCheckboxItem>
                )}
                <MenubarSeparator />
                <MenubarLabel>
                  <span className="flex items-center gap-1.5">
                    <IconKeyboard size={10} />
                    Keyboard Shortcuts
                  </span>
                </MenubarLabel>
                <MenubarRadioGroup
                  value={keybindOS}
                  onValueChange={(v) => setKeybindOS(v as KeybindOS)}
                >
                  {OS_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <MenubarRadioItem key={value} value={value}>
                      <Icon size={13} className="shrink-0 text-muted-foreground" />
                      {label}
                    </MenubarRadioItem>
                  ))}
                </MenubarRadioGroup>
              </MenubarContent>
            </MenubarPositioner>
          </MenubarPortal>
        </MenubarMenu>

        {/* ── Development ── */}
        {isAuthed && (
          <MenubarMenu>
            <MenubarTrigger>Development</MenubarTrigger>
            <MenubarPortal>
              <MenubarPositioner>
                <MenubarContent>
                  <MenubarCheckboxItem
                    checked={!!devConsoleOpen}
                    onCheckedChange={onToggleDevConsole}
                  >
                    <IconTerminal2 size={12} className="shrink-0 text-muted-foreground" />
                    Dev Console
                    <MenubarShortcut>{fmtShortcut("D", keybindOS)}</MenubarShortcut>
                  </MenubarCheckboxItem>
                </MenubarContent>
              </MenubarPositioner>
            </MenubarPortal>
          </MenubarMenu>
        )}

      </Menubar>

      <ExportDrawer
        open={exportOpen}
        onOpenChange={setExportOpen}
        panelId={panelId}
      />
    </>
  );
}
