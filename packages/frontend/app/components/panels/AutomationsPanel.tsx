"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    IconCpu,
    IconBolt,
    IconPlus,
    IconX,
    IconPlugConnected,
    IconTrash,
} from "@tabler/icons-react";
import { useSmartButtons, type SmartButton } from "../../lib/useSmartButtons";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AutomationTrigger {
    kind: string;
    device_id: string;
    button_name: string;
    on_state: boolean | null;
}

interface AutomationAction {
    kind: string;
    device_name: string;
    power: boolean;
}

interface Automation {
    id: string;
    name: string;
    enabled: boolean;
    trigger: AutomationTrigger;
    actions: AutomationAction[];
    created_at: string;
    last_triggered_at: string | null;
}

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 148;
const WIRE_W = 72;
const PORT_R = 6;
const ROW_GAP = 24;
const CANVAS_PAD = 32;
const ADD_STUB_W = 60;

const TC = "var(--color-blue)";
const TC_HEX = "#428ce2";
const AC = "#10b981";
const WC = "var(--color-blue)";
const WC_HEX = "#428ce2";

// ── Mobile hook ───────────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 560) {
    const [mobile, setMobile] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth < breakpoint : false
    );
    useEffect(() => {
        const handler = () => setMobile(window.innerWidth < breakpoint);
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
    }, [breakpoint]);
    return mobile;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRel(iso: string): string {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (d < 60) return `${d}s ago`;
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
    return `${Math.floor(d / 86400)}d ago`;
}

function isRecent(iso: string | null): boolean {
    return !!iso && Date.now() - new Date(iso).getTime() < 45_000;
}

function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ── Wire SVG ──────────────────────────────────────────────────────────────────

function WireConnector({
    enabled,
    recentlyTriggered,
    running,
    vertical = false,
}: {
    enabled: boolean;
    recentlyTriggered: boolean;
    running: boolean;
    vertical?: boolean;
}) {
    const wireColor = enabled ? WC_HEX : "#374151";
    const glowing = (running || recentlyTriggered) && enabled;

    if (vertical) {
        const MID_X = NODE_W / 2;
        const y1 = PORT_R + 1;
        const y2 = WIRE_W - PORT_R - 1;
        return (
            <svg width={NODE_W} height={WIRE_W} style={{ flexShrink: 0, overflow: "visible", display: "block" }}>
                <defs><filter id="vglow"><feGaussianBlur in="SourceGraphic" stdDeviation="3" /></filter></defs>
                {glowing && <line x1={MID_X} y1={y1} x2={MID_X} y2={y2} stroke={WC_HEX} strokeWidth={8} strokeOpacity={0.3} filter="url(#vglow)" />}
                <line
                    x1={MID_X} y1={y1} x2={MID_X} y2={y2}
                    stroke={wireColor} strokeWidth={1.5}
                    strokeDasharray={enabled ? "7 3" : "3 4"}
                    strokeOpacity={enabled ? 1 : 0.35}
                    style={enabled ? { animation: "flowWireV 0.55s linear infinite" } : undefined}
                />
                {enabled && (
                    <polygon points={`${MID_X - 4},${y2 - 5} ${MID_X},${y2 + 2} ${MID_X + 4},${y2 - 5}`} fill={wireColor} opacity={0.8} />
                )}
                <circle cx={MID_X} cy={PORT_R} r={PORT_R} fill="var(--color-primary)" stroke={enabled ? TC_HEX : "#374151"} strokeWidth={2} />
                <circle cx={MID_X} cy={WIRE_W - PORT_R} r={PORT_R} fill="var(--color-primary)" stroke={enabled ? AC : "#374151"} strokeWidth={2} />
            </svg>
        );
    }

    const MID = NODE_H / 2;
    const x1 = PORT_R + 1;
    const x2 = WIRE_W - PORT_R - 1;
    return (
        <svg width={WIRE_W} height={NODE_H} style={{ flexShrink: 0, overflow: "visible" }}>
            <defs><filter id="wglow"><feGaussianBlur in="SourceGraphic" stdDeviation="3" /></filter></defs>
            {glowing && <line x1={x1} y1={MID} x2={x2} y2={MID} stroke={WC_HEX} strokeWidth={8} strokeOpacity={0.3} filter="url(#wglow)" />}
            <line
                x1={x1} y1={MID} x2={x2} y2={MID}
                stroke={wireColor} strokeWidth={1.5}
                strokeDasharray={enabled ? "7 3" : "3 4"}
                strokeOpacity={enabled ? 1 : 0.35}
                style={enabled ? { animation: "flowWire 0.55s linear infinite" } : undefined}
            />
            {enabled && (
                <polygon points={`${x2 - 5},${MID - 4} ${x2 + 2},${MID} ${x2 - 5},${MID + 4}`} fill={wireColor} opacity={0.8} />
            )}
            <circle cx={PORT_R} cy={MID} r={PORT_R} fill="var(--color-primary)" stroke={enabled ? TC_HEX : "#374151"} strokeWidth={2} />
            <circle cx={WIRE_W - PORT_R} cy={MID} r={PORT_R} fill="var(--color-primary)" stroke={enabled ? AC : "#374151"} strokeWidth={2} />
        </svg>
    );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={e => { e.stopPropagation(); onChange(!on); }}
            role="switch" aria-checked={on}
            style={{
                position: "relative", width: 30, height: 16,
                borderRadius: 8, border: "none",
                background: on ? TC : "color-mix(in srgb, var(--color-secondary) 140%, transparent)",
                cursor: "pointer", transition: "background 150ms", flexShrink: 0, padding: 0,
            }}
        >
            <span style={{
                position: "absolute", top: 2, left: on ? 16 : 2,
                width: 12, height: 12, borderRadius: "50%", background: "#fff",
                transition: "left 150ms", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }} />
        </button>
    );
}

// ── NodeHeader ────────────────────────────────────────────────────────────────

function NodeHeader({ color, icon, label, enabled }: { color: string; icon: React.ReactNode; label: string; enabled: boolean }) {
    return (
        <div style={{
            background: `color-mix(in srgb, ${color} ${enabled ? "22%" : "10%"}, transparent)`,
            borderBottom: `1px solid color-mix(in srgb, ${color} ${enabled ? "35%" : "20%"}, transparent)`,
            padding: "8px 11px", display: "flex", alignItems: "center", gap: 7,
            borderRadius: "9px 9px 0 0",
        }}>
            <span style={{ display: "flex", alignItems: "center", color: enabled ? color : `color-mix(in srgb, ${color} 60%, var(--color-foreground-sec))`, opacity: enabled ? 1 : 0.7 }}>
                {icon}
            </span>
            <span style={{ fontFamily: "monospace", fontSize: "8.5pt", fontWeight: 700, letterSpacing: "0.07em", color: enabled ? color : `color-mix(in srgb, ${color} 60%, var(--color-foreground-sec))`, textTransform: "uppercase" }}>
                {label}
            </span>
            <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: enabled ? color : "#374151", boxShadow: enabled ? `0 0 6px ${color}` : "none", transition: "all 200ms" }} />
        </div>
    );
}

// ── FieldRow ──────────────────────────────────────────────────────────────────

function FieldRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div style={{ marginBottom: 7 }}>
            <div style={{ fontFamily: "monospace", fontSize: "7pt", letterSpacing: "0.09em", color: "var(--color-foreground-sec)", opacity: 0.65, marginBottom: 1, textTransform: "uppercase" }}>
                {label}
            </div>
            <div style={{ fontSize: "9.5pt", fontWeight: 600, color: accent ?? "var(--color-foreground)", fontFamily: accent ? "monospace" : "inherit", letterSpacing: accent ? "0.04em" : 0 }}>
                {value}
            </div>
        </div>
    );
}

// ── Pill ──────────────────────────────────────────────────────────────────────

function Pill({ label, color }: { label: string; color: string }) {
    return (
        <span style={{
            display: "inline-block", fontFamily: "monospace", fontSize: "7.5pt", fontWeight: 700,
            letterSpacing: "0.07em", textTransform: "uppercase", color,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
            padding: "2px 8px", borderRadius: 4,
        }}>
            {label}
        </span>
    );
}

// ── TriggerNode ───────────────────────────────────────────────────────────────

function TriggerNode({ auto, devices, selected, fullWidth, onClick, onToggle }: {
    auto: Automation; devices: SmartButton[]; selected: boolean; fullWidth?: boolean;
    onClick: () => void; onToggle: (enabled: boolean) => void;
}) {
    const dev = devices.find(d => d.device_id === auto.trigger.device_id);
    const devName = dev ? (dev.device_name ?? dev.name) : auto.trigger.device_id;
    const stateStr = auto.trigger.on_state === true ? "turns ON" : auto.trigger.on_state === false ? "turns OFF" : "any change";
    const stateColor = auto.trigger.on_state === true ? "#22c55e" : auto.trigger.on_state === false ? "#ef4444" : "#f59e0b";

    return (
        <div onClick={onClick} style={{
            width: fullWidth ? "100%" : NODE_W, height: NODE_H, flexShrink: 0,
            borderRadius: 10,
            border: `1.5px solid ${selected ? TC : auto.enabled ? `color-mix(in srgb, ${TC} 40%, transparent)` : "color-mix(in srgb, var(--color-secondary) 80%, transparent)"}`,
            background: "var(--color-primary)", cursor: "pointer", overflow: "visible",
            display: "flex", flexDirection: "column",
            boxShadow: selected ? `0 0 0 2px color-mix(in srgb, ${TC} 25%, transparent), 0 4px 20px color-mix(in srgb, ${TC} 20%, transparent)` : auto.enabled ? `0 2px 12px rgba(0,0,0,0.2)` : "none",
            transition: "box-shadow 150ms, border-color 150ms", boxSizing: "border-box",
        }}>
            <NodeHeader color={TC} icon={<IconCpu size={13} />} label="Button Trigger" enabled={auto.enabled} />
            <div style={{ padding: "10px 11px 0", flex: 1, overflow: "hidden" }}>
                <FieldRow label="Device" value={truncate(devName, 22)} />
                <FieldRow label="Button" value={truncate(auto.trigger.button_name, 22)} />
                <Pill label={stateStr} color={auto.enabled ? stateColor : "#4b5563"} />
            </div>
            <div style={{ borderTop: "1px solid color-mix(in srgb, var(--color-secondary) 80%, transparent)", padding: "6px 11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Toggle on={auto.enabled} onChange={onToggle} />
                <span style={{ fontFamily: "monospace", fontSize: "7pt", color: "var(--color-foreground-sec)", opacity: 0.5 }}>
                    {selected ? "SELECTED" : "TAP TO EDIT"}
                </span>
            </div>
        </div>
    );
}

// ── ActionNode ────────────────────────────────────────────────────────────────

type TestState =
    | { status: "idle" }
    | { status: "running" }
    | { status: "ok"; message: string }
    | { status: "err"; message: string };

function ActionNode({ auto, action, selected, fullWidth, test, onClick, onTest, onDelete }: {
    auto: Automation; action: AutomationAction; selected: boolean; fullWidth?: boolean;
    test: TestState; onClick: () => void;
    onTest: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
}) {
    const powerColor = action.power ? "#22c55e" : "#ef4444";
    const powerStr = action.power ? "TURN ON" : "TURN OFF";
    const testColor = test.status === "ok" ? "#22c55e" : test.status === "err" ? "#ef4444" : test.status === "running" ? TC : "var(--color-foreground-sec)";

    return (
        <div onClick={onClick} style={{
            width: fullWidth ? "100%" : NODE_W, height: NODE_H, flexShrink: 0,
            borderRadius: 10,
            border: `1.5px solid ${selected ? AC : auto.enabled ? `color-mix(in srgb, ${AC} 40%, transparent)` : "color-mix(in srgb, var(--color-secondary) 80%, transparent)"}`,
            background: "var(--color-primary)", cursor: "pointer", display: "flex", flexDirection: "column",
            boxShadow: selected ? `0 0 0 2px color-mix(in srgb, ${AC} 25%, transparent), 0 4px 20px color-mix(in srgb, ${AC} 20%, transparent)` : auto.enabled ? `0 2px 12px rgba(0,0,0,0.2)` : "none",
            transition: "box-shadow 150ms, border-color 150ms", boxSizing: "border-box",
        }}>
            <NodeHeader color={AC} icon={<IconBolt size={13} />} label="Tapo Power" enabled={auto.enabled} />
            <div style={{ padding: "10px 11px 0", flex: 1, overflow: "hidden" }}>
                <FieldRow label="Device" value={truncate(action.device_name || "—", 22)} />
                <Pill label={powerStr} color={auto.enabled ? powerColor : "#4b5563"} />
                <div style={{ marginTop: 7, minHeight: 16 }}>
                    {test.status !== "idle" ? (
                        <span style={{ fontFamily: "monospace", fontSize: "7.5pt", color: testColor }}>
                            {test.status === "running" ? "▶ running…" : test.status === "ok" ? `✓ ${(test as { message: string }).message}` : `✗ ${(test as { message: string }).message}`}
                        </span>
                    ) : auto.last_triggered_at ? (
                        <span style={{ fontFamily: "monospace", fontSize: "7pt", color: "var(--color-foreground-sec)", opacity: 0.5 }}>
                            ↻ {fmtRel(auto.last_triggered_at)}
                        </span>
                    ) : null}
                </div>
            </div>
            <div style={{ borderTop: "1px solid color-mix(in srgb, var(--color-secondary) 80%, transparent)", padding: "5px 8px", display: "flex", alignItems: "center", gap: 4 }}>
                <NodeBtn label={test.status === "running" ? "…" : "▶ Run"} color={TC} disabled={test.status === "running"} onClick={onTest} />
                <NodeBtn label="Delete" color="#ef4444" onClick={onDelete} />
            </div>
        </div>
    );
}

function NodeBtn({ label, color, disabled, onClick }: { label: string; color: string; disabled?: boolean; onClick: (e: React.MouseEvent) => void }) {
    return (
        <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); if (!disabled) onClick(e); }}
            disabled={disabled}
            style={{
                padding: "3px 9px", borderRadius: 5,
                border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
                background: `color-mix(in srgb, ${color} 10%, transparent)`,
                color: disabled ? "var(--color-foreground-sec)" : color,
                fontSize: "7.5pt", fontFamily: "monospace", fontWeight: 600,
                cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
                letterSpacing: "0.03em", transition: "all 100ms",
            }}
        >
            {label}
        </button>
    );
}

// ── InlineAddSuffix ───────────────────────────────────────────────────────────

function InlineAddSuffix({ onClick }: { onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
    const [hover, setHover] = useState(false);
    const MID = NODE_H / 2;
    const LINE_END = ADD_STUB_W - 18;

    return (
        <div
            style={{ position: "relative", width: ADD_STUB_W, height: NODE_H, flexShrink: 0 }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <svg width={ADD_STUB_W} height={NODE_H} style={{ position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none" }}>
                <line x1={0} y1={MID} x2={LINE_END} y2={MID} stroke={hover ? WC_HEX : "#374151"} strokeWidth={1.5} strokeDasharray="5 4" style={{ transition: "stroke 150ms" }} />
            </svg>
            <button
                onClick={onClick}
                onMouseDown={e => e.stopPropagation()}
                style={{
                    position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                    width: 28, height: 28, borderRadius: "50%",
                    border: `1.5px dashed color-mix(in srgb, ${WC} ${hover ? "80%" : "40%"}, transparent)`,
                    background: hover ? `color-mix(in srgb, ${WC} 14%, var(--color-primary))` : "var(--color-primary)",
                    color: hover ? WC : "color-mix(in srgb, var(--color-foreground-sec) 70%, transparent)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 150ms", padding: 0,
                }}
            >
                <IconPlus size={14} />
            </button>
        </div>
    );
}

// ── FlyoutMenu ────────────────────────────────────────────────────────────────

function FlyoutMenu({ anchor, onSelect, onClose }: {
    anchor: { x: number; y: number };
    onSelect: (kind: "tapo" | "jmiot") => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    const options: { kind: "tapo" | "jmiot"; label: string; icon: React.ReactNode; desc: string }[] = [
        { kind: "tapo", label: "TpLink Tapo Device", icon: <IconBolt size={15} />, desc: "Smart plug / bulb power" },
        { kind: "jmiot", label: "JMIoT Device", icon: <IconPlugConnected size={15} />, desc: "Custom IoT action" },
    ];

    return (
        <div ref={ref} style={{
            position: "fixed", top: anchor.y + 6, left: anchor.x - 160, zIndex: 400,
            background: "var(--color-primary)",
            border: "1px solid color-mix(in srgb, var(--color-secondary) 110%, transparent)",
            borderRadius: 9, boxShadow: "0 8px 32px rgba(0,0,0,0.45)", minWidth: 200, overflow: "hidden",
        }}>
            <div style={{ padding: "7px 12px 5px", borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 80%, transparent)" }}>
                <span style={{ fontFamily: "monospace", fontSize: "7pt", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-foreground-sec)", opacity: 0.55 }}>
                    Add node
                </span>
            </div>
            {options.map(opt => (
                <button key={opt.kind} onClick={() => onSelect(opt.kind)} style={{ width: "100%", padding: "9px 12px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, color: "var(--color-foreground)", fontFamily: "inherit", transition: "background 100ms" }}
                    onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, ${WC} 9%, transparent)`)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                    <span style={{ color: WC, display: "flex", alignItems: "center" }}>{opt.icon}</span>
                    <div>
                        <div style={{ fontSize: "9pt", fontWeight: 600 }}>{opt.label}</div>
                        <div style={{ fontSize: "7.5pt", color: "var(--color-foreground-sec)", opacity: 0.6, marginTop: 1 }}>{opt.desc}</div>
                    </div>
                </button>
            ))}
        </div>
    );
}

// ── AutomationRow ─────────────────────────────────────────────────────────────

function AutomationRow({ auto, devices, selectedId, onSelect, onTest, onDelete, onToggle, testState, mobile, onAddClick }: {
    auto: Automation; devices: SmartButton[]; selectedId: string | null;
    onSelect: (id: string) => void; onTest: (id: string) => void;
    onDelete: (id: string) => void; onToggle: (id: string, enabled: boolean) => void;
    testState: TestState; mobile: boolean;
    onAddClick: (e: React.MouseEvent<HTMLButtonElement>, autoId: string) => void;
}) {
    const sel = selectedId === auto.id;
    const recent = isRecent(auto.last_triggered_at) || testState.status === "ok";
    const running = testState.status === "running";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Label */}
            <div style={{
                fontFamily: "monospace", fontSize: "8pt",
                color: sel ? TC : "var(--color-foreground-sec)",
                opacity: sel ? 1 : 0.55, marginBottom: 5,
                letterSpacing: "0.04em", paddingLeft: 2, transition: "color 150ms, opacity 150ms",
            }}>
                <span style={{ opacity: 0.4 }}>// </span>{auto.name}
            </div>

            {mobile ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                    <TriggerNode auto={auto} devices={devices} selected={sel} fullWidth onClick={() => onSelect(auto.id)} onToggle={v => onToggle(auto.id, v)} />
                    {auto.actions.map((action, i) => (
                        <React.Fragment key={i}>
                            <WireConnector enabled={auto.enabled} recentlyTriggered={recent} running={running} vertical />
                            <ActionNode auto={auto} action={action} selected={sel} fullWidth test={testState}
                                onClick={() => onSelect(auto.id)}
                                onTest={e => { e.stopPropagation(); onTest(auto.id); }}
                                onDelete={e => { e.stopPropagation(); onDelete(auto.id); }}
                            />
                        </React.Fragment>
                    ))}
                </div>
            ) : (
                <div style={{ display: "flex", alignItems: "center" }}>
                    <TriggerNode auto={auto} devices={devices} selected={sel} onClick={() => onSelect(auto.id)} onToggle={v => onToggle(auto.id, v)} />
                    {auto.actions.map((action, i) => (
                        <React.Fragment key={i}>
                            <WireConnector enabled={auto.enabled} recentlyTriggered={recent} running={running} />
                            <ActionNode auto={auto} action={action} selected={sel} test={testState}
                                onClick={() => onSelect(auto.id)}
                                onTest={e => { e.stopPropagation(); onTest(auto.id); }}
                                onDelete={e => { e.stopPropagation(); onDelete(auto.id); }}
                            />
                        </React.Fragment>
                    ))}
                    <InlineAddSuffix onClick={e => onAddClick(e, auto.id)} />
                </div>
            )}
        </div>
    );
}

// ── PropertiesPanel ───────────────────────────────────────────────────────────

type ActionForm = { kind: string; device_name: string; power: boolean };

const BLANK_ACTION: ActionForm = { kind: "tapo_power", device_name: "", power: true };

const BLANK = {
    name: "",
    enabled: true,
    trigger_device_id: "",
    trigger_button_name: "",
    trigger_on_state: "on" as "on" | "off" | "any",
    actions: [{ ...BLANK_ACTION }],
};

function PropertiesPanel({ automation, isNew, devices, tapoDevices, onSave, onClose, mobile }: {
    automation: Automation | null; isNew: boolean; devices: SmartButton[]; tapoDevices: string[];
    onSave: (payload: object, id?: string) => Promise<void>; onClose: () => void; mobile: boolean;
}) {
    const [form, setForm] = useState(() => {
        if (!automation || isNew) return { ...BLANK, actions: [{ ...BLANK_ACTION }] };
        return {
            name: automation.name,
            enabled: automation.enabled,
            trigger_device_id: automation.trigger.device_id,
            trigger_button_name: automation.trigger.button_name,
            trigger_on_state: (
                automation.trigger.on_state === true ? "on" :
                automation.trigger.on_state === false ? "off" : "any"
            ) as "on" | "off" | "any",
            actions: automation.actions.length > 0
                ? automation.actions.map(a => ({ kind: a.kind, device_name: a.device_name, power: a.power }))
                : [{ ...BLANK_ACTION }],
        };
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const setField = <K extends keyof typeof BLANK>(k: K, v: typeof BLANK[K]) =>
        setForm(f => ({ ...f, [k]: v }));

    const setAction = (idx: number, patch: Partial<ActionForm>) =>
        setForm(f => {
            const actions = [...f.actions];
            actions[idx] = { ...actions[idx], ...patch };
            return { ...f, actions };
        });

    const addAction = () => setForm(f => ({ ...f, actions: [...f.actions, { ...BLANK_ACTION }] }));
    const removeAction = (idx: number) => setForm(f => ({ ...f, actions: f.actions.filter((_, i) => i !== idx) }));

    const selectedDev = devices.find(d => d.device_id === form.trigger_device_id);
    const availButtons = selectedDev?.buttons.filter(b => b.name) ?? [];

    const handleSave = async () => {
        if (!form.name.trim()) { setError("Name is required."); return; }
        if (!form.trigger_device_id) { setError("Select a trigger device."); return; }
        if (!form.trigger_button_name) { setError("Select a button."); return; }
        if (form.actions.some(a => !a.device_name)) { setError("All actions need a device selected."); return; }
        setSaving(true); setError(null);
        try {
            await onSave({
                name: form.name.trim(),
                enabled: form.enabled,
                trigger: {
                    device_id: form.trigger_device_id,
                    button_name: form.trigger_button_name,
                    on_state: form.trigger_on_state === "on" ? true : form.trigger_on_state === "off" ? false : null,
                },
                actions: form.actions.map(a => ({ kind: a.kind, device_name: a.device_name, power: a.power })),
            }, isNew ? undefined : automation?.id);
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Save failed.");
        } finally {
            setSaving(false);
        }
    };

    const INP: React.CSSProperties = { width: "100%", padding: "6px 9px", borderRadius: 6, border: "1px solid color-mix(in srgb, var(--color-secondary) 120%, transparent)", background: "color-mix(in srgb, var(--color-secondary) 35%, transparent)", color: "var(--color-foreground)", fontSize: "9.5pt", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
    const SEL: React.CSSProperties = { ...INP, cursor: "pointer" };
    const LBL: React.CSSProperties = { fontFamily: "monospace", fontSize: "7.5pt", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--color-foreground-sec)", opacity: 0.7, marginBottom: 4, display: "block" };
    const FIELD: React.CSSProperties = { marginBottom: 12 };

    const SectionHeader = ({ color, icon, label }: { color: string; icon: React.ReactNode; label: string }) => (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}>
            <span style={{ color, display: "flex", alignItems: "center" }}>{icon}</span>
            <span style={{ fontFamily: "monospace", fontSize: "8pt", fontWeight: 700, letterSpacing: "0.07em", color, textTransform: "uppercase" }}>{label}</span>
        </div>
    );

    const panelStyle: React.CSSProperties = mobile ? {
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, maxHeight: "80vh",
        borderRadius: "16px 16px 0 0", borderTop: "1px solid color-mix(in srgb, var(--color-secondary) 80%, transparent)",
        background: "var(--color-primary)", display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
    } : {
        width: 260, flexShrink: 0,
        borderLeft: "1px solid color-mix(in srgb, var(--color-secondary) 80%, transparent)",
        background: "color-mix(in srgb, var(--color-secondary) 18%, var(--color-primary))",
        display: "flex", flexDirection: "column", overflowY: "auto",
    };

    return (
        <>
            {mobile && <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 199, background: "rgba(0,0,0,0.45)" }} />}
            <div style={panelStyle}>
                {mobile && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
                        <div style={{ width: 36, height: 4, borderRadius: 2, background: "color-mix(in srgb, var(--color-secondary) 120%, transparent)" }} />
                    </div>
                )}
                {/* Panel header */}
                <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 80%, transparent)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <div>
                        <p style={{ fontFamily: "monospace", fontSize: "8pt", letterSpacing: "0.08em", textTransform: "uppercase", color: TC, margin: 0 }}>Properties</p>
                        <p style={{ fontSize: "9.5pt", fontWeight: 700, color: "var(--color-foreground)", margin: "2px 0 0" }}>
                            {isNew ? "New Automation" : truncate(form.name || "Automation", 20)}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid color-mix(in srgb, var(--color-secondary) 100%, transparent)", background: "transparent", color: "var(--color-foreground-sec)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <IconX size={14} />
                    </button>
                </div>

                {/* Form */}
                <div style={{ padding: "14px 14px 0", flex: 1, overflowY: "auto" }}>
                    {/* General */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={FIELD}>
                            <label style={LBL}>Name</label>
                            <input style={INP} value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Lights on press" autoFocus />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Toggle on={form.enabled} onChange={v => setField("enabled", v)} />
                            <span style={{ fontSize: "9pt", color: "var(--color-foreground-sec)" }}>{form.enabled ? "Enabled" : "Disabled"}</span>
                        </div>
                    </div>

                    <div style={{ height: 1, background: "color-mix(in srgb, var(--color-secondary) 80%, transparent)", marginBottom: 14 }} />

                    {/* Trigger */}
                    <div style={{ marginBottom: 16 }}>
                        <SectionHeader color={TC} icon={<IconCpu size={13} />} label="Trigger" />
                        <div style={FIELD}>
                            <label style={LBL}>Device</label>
                            <select style={SEL} value={form.trigger_device_id} onChange={e => {
                                const devId = e.target.value;
                                const dev = devices.find(d => d.device_id === devId);
                                setField("trigger_device_id", devId);
                                setField("trigger_button_name", dev?.buttons.find(b => b.name)?.name ?? "");
                            }}>
                                <option value="">Select device…</option>
                                {devices.map(d => <option key={d.device_id} value={d.device_id}>{d.device_name ?? d.name}</option>)}
                            </select>
                        </div>
                        <div style={FIELD}>
                            <label style={LBL}>Button</label>
                            {availButtons.length > 0 ? (
                                <select style={SEL} value={form.trigger_button_name} onChange={e => setField("trigger_button_name", e.target.value)}>
                                    {availButtons.map(b => <option key={b.button} value={b.name!}>{b.name}</option>)}
                                </select>
                            ) : (
                                <p style={{ fontSize: "8.5pt", color: "var(--color-foreground-sec)", margin: 0, fontStyle: "italic" }}>
                                    {form.trigger_device_id ? "No named buttons — set names in JMIoT panel." : "Select a device first."}
                                </p>
                            )}
                        </div>
                        <div style={FIELD}>
                            <label style={LBL}>State</label>
                            <select style={SEL} value={form.trigger_on_state} onChange={e => setField("trigger_on_state", e.target.value as "on" | "off" | "any")}>
                                <option value="on">Turns ON</option>
                                <option value="off">Turns OFF</option>
                                <option value="any">Any change</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ height: 1, background: "color-mix(in srgb, var(--color-secondary) 80%, transparent)", marginBottom: 14 }} />

                    {/* Actions — one section per action */}
                    {form.actions.map((action, idx) => (
                        <div key={idx} style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid color-mix(in srgb, ${AC} 25%, transparent)` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                    <span style={{ color: AC, display: "flex", alignItems: "center" }}><IconBolt size={13} /></span>
                                    <span style={{ fontFamily: "monospace", fontSize: "8pt", fontWeight: 700, letterSpacing: "0.07em", color: AC, textTransform: "uppercase" }}>
                                        {form.actions.length > 1 ? `Action ${idx + 1}` : "Action"}
                                    </span>
                                </div>
                                {form.actions.length > 1 && (
                                    <button onClick={() => removeAction(idx)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", display: "flex", alignItems: "center", padding: 3, borderRadius: 4 }}>
                                        <IconTrash size={13} />
                                    </button>
                                )}
                            </div>
                            <div style={FIELD}>
                                <label style={LBL}>Tapo Device</label>
                                <select style={SEL} value={action.device_name} onChange={e => setAction(idx, { device_name: e.target.value })}>
                                    <option value="">Select device…</option>
                                    {tapoDevices.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                            <div style={FIELD}>
                                <label style={LBL}>Action</label>
                                <select style={SEL} value={action.power ? "on" : "off"} onChange={e => setAction(idx, { power: e.target.value === "on" })}>
                                    <option value="on">Turn ON</option>
                                    <option value="off">Turn OFF</option>
                                </select>
                            </div>
                        </div>
                    ))}

                    {/* Add action button */}
                    <button onClick={addAction} style={{ width: "100%", padding: "7px 0", marginBottom: 14, borderRadius: 6, border: `1px dashed color-mix(in srgb, ${AC} 45%, transparent)`, background: `color-mix(in srgb, ${AC} 6%, transparent)`, color: AC, fontSize: "8.5pt", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <IconPlus size={13} /> ADD ACTION
                    </button>

                    {error && <p style={{ fontSize: "8.5pt", color: "#ef4444", margin: "0 0 12px", fontStyle: "italic" }}>{error}</p>}
                </div>

                {/* Save/cancel */}
                <div style={{ padding: "10px 14px", borderTop: "1px solid color-mix(in srgb, var(--color-secondary) 80%, transparent)", display: "flex", gap: 6, flexShrink: 0, paddingBottom: mobile ? "max(10px, env(safe-area-inset-bottom))" : "10px" }}>
                    <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "1px solid color-mix(in srgb, var(--color-secondary) 100%, transparent)", background: "transparent", color: "var(--color-foreground-sec)", fontSize: "10pt", cursor: "pointer" }}>
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: `1px solid color-mix(in srgb, ${TC} 50%, transparent)`, background: `color-mix(in srgb, ${TC} 15%, transparent)`, color: TC, fontSize: "10pt", fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: "monospace" }}>
                        {saving ? "SAVING…" : isNew ? "CREATE" : "SAVE"}
                    </button>
                </div>
            </div>
        </>
    );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onClick, mobile }: { onClick: () => void; mobile: boolean }) {
    const [hover, setHover] = useState(false);
    const MID = NODE_H / 2;

    const ghostNode = (color: string, label: string, fw: boolean) => (
        <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ width: fw ? "100%" : NODE_W, height: NODE_H, borderRadius: 10, border: `1.5px dashed color-mix(in srgb, ${color} ${hover ? "60%" : "28%"}, transparent)`, background: `color-mix(in srgb, ${color} ${hover ? "6%" : "3%"}, transparent)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 8, transition: "all 150ms", boxSizing: "border-box" }}>
            <span style={{ color: `color-mix(in srgb, ${color} ${hover ? "70%" : "38%"}, transparent)`, transition: "color 150ms", display: "flex" }}><IconPlus size={22} /></span>
            <span style={{ fontFamily: "monospace", fontSize: "7.5pt", color: `color-mix(in srgb, ${color} ${hover ? "70%" : "38%"}, transparent)`, letterSpacing: "0.07em", transition: "color 150ms" }}>{label}</span>
        </div>
    );

    if (mobile) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                {ghostNode(TC, "ADD TRIGGER", true)}
                <svg width={NODE_W} height={WIRE_W} style={{ opacity: hover ? 0.5 : 0.2, transition: "opacity 150ms", display: "block" }}>
                    <line x1={NODE_W / 2} y1={PORT_R} x2={NODE_W / 2} y2={WIRE_W - PORT_R} stroke={WC_HEX} strokeWidth={1.5} strokeDasharray="5 4" />
                    <circle cx={NODE_W / 2} cy={PORT_R} r={PORT_R} fill="var(--color-primary)" stroke={TC_HEX} strokeWidth={1.5} strokeOpacity={0.5} />
                    <circle cx={NODE_W / 2} cy={WIRE_W - PORT_R} r={PORT_R} fill="var(--color-primary)" stroke={AC} strokeWidth={1.5} strokeOpacity={0.5} />
                </svg>
                {ghostNode(AC, "ADD ACTION", true)}
            </div>
        );
    }

    return (
        <div style={{ display: "flex", alignItems: "center" }}>
            {ghostNode(TC, "ADD TRIGGER", false)}
            <svg width={WIRE_W} height={NODE_H} style={{ flexShrink: 0, opacity: hover ? 0.5 : 0.2, transition: "opacity 150ms" }}>
                <line x1={PORT_R} y1={MID} x2={WIRE_W - PORT_R} y2={MID} stroke={WC_HEX} strokeWidth={1.5} strokeDasharray="5 4" />
                <circle cx={PORT_R} cy={MID} r={PORT_R} fill="var(--color-primary)" stroke={TC_HEX} strokeWidth={1.5} strokeOpacity={0.5} />
                <circle cx={WIRE_W - PORT_R} cy={MID} r={PORT_R} fill="var(--color-primary)" stroke={AC} strokeWidth={1.5} strokeOpacity={0.5} />
            </svg>
            {ghostNode(AC, "ADD ACTION", false)}
        </div>
    );
}

// ── AutomationsPanel ──────────────────────────────────────────────────────────

export default function AutomationsPanel() {
    const mobile = useIsMobile();
    const { devices } = useSmartButtons();
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [tapoDevices, setTapoDevices] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [testStates, setTestStates] = useState<Record<string, TestState>>({});
    const [flyoutAnchor, setFlyoutAnchor] = useState<{ x: number; y: number; autoId: string } | null>(null);
    const reloadTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/automations");
            if (r.ok) setAutomations(await r.json());
        } catch { /* ignore */ }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        fetch("/api/power")
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.devices) setTapoDevices((data.devices as { name: string }[]).map(d => d.name)); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        reloadTimer.current = setInterval(() => setAutomations(a => [...a]), 30_000);
        return () => { if (reloadTimer.current) clearInterval(reloadTimer.current); };
    }, []);

    const handleSave = async (payload: object, id?: string) => {
        const url = id ? `/api/automations/${id}` : "/api/automations";
        const method = id ? "PUT" : "POST";
        const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error ?? `Server returned ${res.status}`);
        }
        await load();
    };

    const handleToggle = async (id: string, enabled: boolean) => {
        const auto = automations.find(a => a.id === id);
        if (!auto) return;
        setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled } : a));
        try {
            await fetch(`/api/automations/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...auto, enabled }) });
        } catch { await load(); }
    };

    const handleDelete = async (id: string) => {
        setAutomations(prev => prev.filter(a => a.id !== id));
        if (selectedId === id) setSelectedId(null);
        await fetch(`/api/automations/${id}`, { method: "DELETE" });
    };

    const handleTest = async (id: string) => {
        setTestStates(p => ({ ...p, [id]: { status: "running" } }));
        try {
            const res = await fetch(`/api/automations/${id}/trigger`, { method: "POST" });
            const data = await res.json();
            if (data.ok) {
                setTestStates(p => ({ ...p, [id]: { status: "ok", message: data.message ?? "OK" } }));
                await load();
            } else {
                setTestStates(p => ({ ...p, [id]: { status: "err", message: data.error ?? "Error" } }));
            }
        } catch {
            setTestStates(p => ({ ...p, [id]: { status: "err", message: "Network error" } }));
        }
        setTimeout(() => setTestStates(p => ({ ...p, [id]: { status: "idle" } })), 4000);
    };

    const handleSelect = (id: string) => {
        setIsNew(false);
        setSelectedId(prev => prev === id ? null : id);
    };

    const openNew = () => { setSelectedId("__new__"); setIsNew(true); };
    const closePanel = () => { setSelectedId(null); setIsNew(false); };

    const handleAddClick = (e: React.MouseEvent<HTMLButtonElement>, autoId: string) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setFlyoutAnchor({ x: rect.right, y: rect.bottom, autoId });
    };

    const handleFlyoutSelect = (_kind: "tapo" | "jmiot") => {
        if (!flyoutAnchor) return;
        setFlyoutAnchor(null);
        // Open the side panel for this automation so user can add the new action
        setIsNew(false);
        setSelectedId(flyoutAnchor.autoId);
    };

    const selectedAuto = isNew ? null : automations.find(a => a.id === selectedId) ?? null;
    const panelOpen = selectedId !== null;
    const pad = mobile ? 16 : CANVAS_PAD;

    return (
        <>
            <style>{`
                @keyframes flowWire  { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
                @keyframes flowWireV { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
            `}</style>

            <div style={{ display: "flex", height: "100%", overflow: "hidden", position: "relative" }}>
                {/* Canvas */}
                <div style={{ flex: 1, overflowY: "auto", overflowX: mobile ? "hidden" : "auto", backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--color-secondary) 90%, transparent) 1px, transparent 1px)", backgroundSize: "22px 22px", position: "relative" }}>
                    {/* Header */}
                    <div style={{ position: "sticky", top: 0, zIndex: 10, padding: `10px ${pad}px`, display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(8px)", background: "color-mix(in srgb, var(--color-primary) 80%, transparent)", borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 70%, transparent)" }}>
                        <div>
                            <p style={{ fontSize: "10pt", fontWeight: 700, color: "var(--color-foreground)", margin: 0, fontFamily: "monospace", letterSpacing: "0.04em" }}>AUTOMATION GRAPH</p>
                            <p style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", margin: "1px 0 0", opacity: 0.6, fontFamily: "monospace" }}>
                                {automations.length} flow{automations.length !== 1 ? "s" : ""} · {mobile ? "tap" : "click"} to inspect
                            </p>
                        </div>
                        <button onClick={openNew} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid color-mix(in srgb, ${TC} 45%, transparent)`, background: `color-mix(in srgb, ${TC} 12%, transparent)`, color: TC, fontSize: "9pt", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                            <IconPlus size={14} /> NEW
                        </button>
                    </div>

                    {/* Content */}
                    <div style={{ padding: `${pad}px`, minWidth: mobile ? "unset" : NODE_W * 2 + WIRE_W + ADD_STUB_W + pad * 2 }}>
                        {loading && <p style={{ fontFamily: "monospace", fontSize: "8.5pt", color: "var(--color-foreground-sec)", opacity: 0.5 }}>Loading graph…</p>}

                        {!loading && automations.length === 0 && (
                            <div style={{ marginBottom: ROW_GAP }}>
                                <EmptyState onClick={openNew} mobile={mobile} />
                                <p style={{ fontFamily: "monospace", fontSize: "8pt", color: "var(--color-foreground-sec)", opacity: 0.4, marginTop: 20, letterSpacing: "0.04em" }}>
                                    // No automations yet — click a node to configure
                                </p>
                            </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
                            {automations.map(auto => (
                                <AutomationRow
                                    key={auto.id} auto={auto} devices={devices}
                                    selectedId={selectedId} onSelect={handleSelect}
                                    onTest={handleTest} onDelete={handleDelete} onToggle={handleToggle}
                                    mobile={mobile} testState={testStates[auto.id] ?? { status: "idle" }}
                                    onAddClick={handleAddClick}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Side panel */}
                {!mobile && (
                    <div style={{ width: panelOpen ? 260 : 0, overflow: "hidden", transition: "width 220ms ease", flexShrink: 0, display: "flex" }}>
                        {panelOpen && (
                            <PropertiesPanel automation={selectedAuto} isNew={isNew} devices={devices} tapoDevices={tapoDevices} onSave={handleSave} onClose={closePanel} mobile={false} />
                        )}
                    </div>
                )}

                {mobile && panelOpen && (
                    <PropertiesPanel automation={selectedAuto} isNew={isNew} devices={devices} tapoDevices={tapoDevices} onSave={handleSave} onClose={closePanel} mobile />
                )}

                {/* Flyout */}
                {flyoutAnchor && (
                    <FlyoutMenu anchor={flyoutAnchor} onSelect={handleFlyoutSelect} onClose={() => setFlyoutAnchor(null)} />
                )}
            </div>
        </>
    );
}
