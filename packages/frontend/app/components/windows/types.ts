export type PanelId =
	| "dashboard"
	| "analytics-past"
	| "analytics-live"
	| "summary-cost"
	| "summary-power"
	| "summary-energy"
	| "smart-buttons";

export const PANEL_LABELS: Record<PanelId, string> = {
	dashboard:           "Dashboard",
	"analytics-past":    "Power Analytics — Past Data",
	"analytics-live":    "Power Analytics — Live Data",
	"summary-cost":      "Electricity Cost",
	"summary-power":     "Power Draw",
	"summary-energy":    "Energy Usage",
	"smart-buttons":     "Smart Buttons",
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
		id: "smart-buttons",
		label: "Smart Buttons",
		items: [
			{ panelId: "smart-buttons", label: "Devices" },
		],
	},
];

export const ALL_PANELS: PanelId[] = Object.keys(PANEL_LABELS) as PanelId[];

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
