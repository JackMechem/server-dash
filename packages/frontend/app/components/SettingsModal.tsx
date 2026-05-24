"use client";

import { useState, useEffect, useCallback } from "react";
import { IconX, IconShieldHalf } from "@tabler/icons-react";
import {
	Dialog,
	DialogContent,
	DialogPortal,
	DialogOverlay,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/section-label";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

interface AppSettings {
	allow_system_login: boolean;
}

interface Props {
	onClose: () => void;
}

type Section = "security";

export default function SettingsModal({ onClose }: Props) {
	const [section, setSection] = useState<Section>("security");
	const [settings, setSettings] = useState<AppSettings | null>(null);
	const [saving, setSaving] = useState(false);

	const fetchSettings = useCallback(async () => {
		const res = await fetch("/api/settings");
		if (res.ok) setSettings(await res.json());
	}, []);

	useEffect(() => {
		fetchSettings();
	}, [fetchSettings]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	const updateSetting = async <K extends keyof AppSettings>(
		key: K,
		value: AppSettings[K],
	) => {
		if (!settings || saving) return;
		setSaving(true);
		const next = { ...settings, [key]: value };
		const res = await fetch("/api/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(next),
		});
		if (res.ok) setSettings(next);
		setSaving(false);
	};

	const sections: { id: Section; label: string; icon: React.ElementType }[] = [
		{ id: "security", label: "Security", icon: IconShieldHalf },
	];

	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogPortal>
				<DialogOverlay />
				<DialogPrimitive.Popup
					className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-[calc(100%-2rem)] sm:max-w-[700px] max-h-[75vh] flex rounded-2xl border border-border bg-card shadow-2xl outline-none overflow-hidden duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
				>
					{/* Left sidebar */}
					<div className="w-[190px] shrink-0 border-r border-border flex flex-col">
						<div className="px-3.5 pt-[18px] pb-2.5 shrink-0">
							<SectionLabel>Settings</SectionLabel>
						</div>
						<nav className="flex flex-col gap-0.5 px-2 pb-3">
							{sections.map(({ id, label, icon: Icon }) => {
								const active = section === id;
								return (
									<button
										key={id}
										onClick={() => setSection(id)}
										className={`w-full flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
											active
												? "bg-primary/10 text-primary"
												: "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
										}`}
									>
										<Icon size={14} strokeWidth={active ? 2.5 : 2} />
										{label}
									</button>
								);
							})}
						</nav>
					</div>

					{/* Content */}
					<div className="flex-1 flex flex-col min-w-0">
						{/* Content header */}
						<div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
							<span className="text-[15px] font-bold text-foreground capitalize">
								{section}
							</span>
							<button
								onClick={onClose}
								className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
							>
								<IconX size={15} />
							</button>
						</div>

						{/* Content body */}
						<div className="flex-1 overflow-y-auto p-5 flex flex-col gap-2.5">
							{section === "security" &&
								(settings ? (
									<>
										<SettingRow
											title="System login"
											description="Allow /etc/shadow as a fallback when no app credential matches. Disable once your app credentials are set up."
										>
											<Switch
												checked={settings.allow_system_login}
												onCheckedChange={(v) => updateSetting("allow_system_login", v)}
												disabled={saving}
											/>
										</SettingRow>
									</>
								) : (
									<Skeleton className="h-[64px] rounded-xl" />
								))}
						</div>
					</div>
				</DialogPrimitive.Popup>
			</DialogPortal>
		</Dialog>
	);
}

function SettingRow({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4 px-3.5 py-3 rounded-xl bg-muted/30">
			<div className="flex-1 min-w-0">
				<p className="text-[13px] font-semibold text-foreground">{title}</p>
				<p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
					{description}
				</p>
			</div>
			<div className="shrink-0 mt-0.5">{children}</div>
		</div>
	);
}
