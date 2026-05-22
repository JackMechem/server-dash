export interface AppLink {
	name: string;
	description: string;
	href: string;
	icon: string;
}

// Add new services here
export const LINKS: AppLink[] = [
	{
		name: "Syncthing",
		description: "File synchronization",
		href: "https://syncthing.jackmechem.dev",
		icon: "⇄",
	},
];
