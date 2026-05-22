import { TileNode, LeafNode, ContainerNode, PanelId } from "./types";

let _id = 0;
export function gid(): string {
	return `wn-${Date.now()}-${++_id}`;
}

// ── Leaf operations ───────────────────────────────────────────────────────────

function mapLeaf(tree: TileNode, leafId: string, fn: (leaf: LeafNode) => TileNode): TileNode {
	if (tree.type === "leaf") return tree.id === leafId ? fn(tree) : tree;
	return { ...tree, children: tree.children.map((c) => mapLeaf(c, leafId, fn)) };
}

export function splitLeaf(
	tree: TileNode,
	leafId: string,
	dir: "h" | "v",
	newFirst: boolean,
	newPanelId: PanelId,
): TileNode {
	const newLeaf: LeafNode = { type: "leaf", id: gid(), panelId: newPanelId };
	return mapLeaf(tree, leafId, (leaf) => ({
		type: "container",
		id: gid(),
		dir,
		children: newFirst ? [newLeaf, leaf] : [leaf, newLeaf],
		sizes: [1, 1],
	}));
}

export function closeLeaf(tree: TileNode, leafId: string): TileNode | null {
	if (tree.type === "leaf") return tree.id === leafId ? null : tree;
	const children: TileNode[] = [];
	const sizes: number[] = [];
	tree.children.forEach((c, i) => {
		const r = closeLeaf(c, leafId);
		if (r !== null) { children.push(r); sizes.push(tree.sizes[i]); }
	});
	if (children.length === 0) return null;
	if (children.length === 1) return children[0]; // collapse single-child container
	return { ...tree, children, sizes };
}

export function updatePanelId(tree: TileNode, leafId: string, panelId: PanelId): TileNode {
	if (tree.type === "leaf") return tree.id === leafId ? { ...tree, panelId } : tree;
	return { ...tree, children: tree.children.map((c) => updatePanelId(c, leafId, panelId)) };
}

export function patchSizes(tree: TileNode, containerId: string, sizes: number[]): TileNode {
	if (tree.type === "leaf") return tree;
	if (tree.id === containerId) return { ...tree, sizes };
	return { ...tree, children: tree.children.map((c) => patchSizes(c, containerId, sizes)) };
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getFirstLeafId(tree: TileNode): string {
	if (tree.type === "leaf") return tree.id;
	return getFirstLeafId(tree.children[0]);
}

export function countLeaves(tree: TileNode): number {
	if (tree.type === "leaf") return 1;
	return tree.children.reduce((s, c) => s + countLeaves(c), 0);
}

export function getLeafPanel(tree: TileNode, leafId: string): PanelId | null {
	if (tree.type === "leaf") return tree.id === leafId ? tree.panelId : null;
	for (const c of tree.children) {
		const p = getLeafPanel(c, leafId);
		if (p) return p;
	}
	return null;
}
