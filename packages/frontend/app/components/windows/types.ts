export type PanelId =
	| "dashboard"
	| "analytics-past"
	| "analytics-live"
	| "summary-cost"
	| "summary-power"
	| "summary-energy"
	| "devices-overview"
	| "devices-jmiot"
	| "devices-tapo"
	| "devices-automations";

export const PANEL_LABELS: Record<PanelId, string> = {
	dashboard:                "Dashboard",
	"analytics-past":         "Power Analytics — Past Data",
	"analytics-live":         "Power Analytics — Live Data",
	"summary-cost":           "Electricity Cost",
	"summary-power":          "Power Draw",
	"summary-energy":         "Energy Usage",
	"devices-overview":       "Devices — Overview",
	"devices-jmiot":          "Devices — JMIoT",
	"devices-tapo":           "Devices — Tapo",
	"devices-automations":    "Devices — Automations",
};

// ── Sidebar sections ──────────────────────────────────────────────────────────

export interface PanelEntry { panelId: PanelId; label: string; }
export interface PanelSection { id: string; label: string; items: PanelEntry[]; }

export const PANEL_SECTIONS: PanelSection[] = [
	{
		id: "power-analytics",
		label: "Power Analytics",
		items: [
			{ panelId: "analytics-past", label: "Past Data" },
			{ panelId: "analytics-live", label: "Live Data" },
			{ panelId: "summary-cost",   label: "Cost" },
			{ panelId: "summary-power",  label: "Power" },
			{ panelId: "summary-energy", label: "Energy" },
		],
	},
	{
		id: "devices",
		label: "Devices",
		items: [
			{ panelId: "devices-overview",     label: "Overview" },
			{ panelId: "devices-jmiot",        label: "JMIoT" },
			{ panelId: "devices-tapo",         label: "Tapo" },
			{ panelId: "devices-automations",  label: "Automations" },
		],
	},
];

export const ALL_PANELS: PanelId[] = Object.keys(PANEL_LABELS) as PanelId[];

export function getVisibleSections(tapo: boolean): PanelSection[] {
	if (tapo) return PANEL_SECTIONS;
	return PANEL_SECTIONS
		.filter((s) => s.id !== "power-analytics")
		.map((s) =>
			s.id === "devices"
				? { ...s, items: s.items.filter((i) => i.panelId !== "devices-tapo") }
				: s,
		);
}

// ── N-ary pane tree ───────────────────────────────────────────────────────────

export type LeafNode = { type: "leaf"; id: string; panelId: PanelId };
export type ContainerNode = {
	type: "container";
	id: string;
	dir: "h" | "v";
	children: TileNode[];
	sizes: number[];
};
export type TileNode = LeafNode | ContainerNode;
