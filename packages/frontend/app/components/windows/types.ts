export type PanelId =
	| "dashboard"
	| "analytics-line"
	| "analytics-bar"
	| "analytics-candle";

export const PANEL_LABELS: Record<PanelId, string> = {
	dashboard:           "Dashboard",
	"analytics-line":    "Power Analytics — Line",
	"analytics-bar":     "Power Analytics — Bar",
	"analytics-candle":  "Power Analytics — Candlestick",
};

// ── Sidebar sections ──────────────────────────────────────────────────────────

export interface PanelEntry { panelId: PanelId; label: string; }
export interface PanelSection { id: string; label: string; items: PanelEntry[]; }

export const PANEL_SECTIONS: PanelSection[] = [
	{
		id: "power-analytics",
		label: "Power Analytics",
		items: [
			{ panelId: "analytics-line",   label: "Line Chart" },
			{ panelId: "analytics-bar",    label: "Bar Chart" },
			{ panelId: "analytics-candle", label: "Candlestick" },
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
