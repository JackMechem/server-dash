"use client";

import { useState, useEffect, useCallback } from "react";
import { IconX, IconShieldHalf } from "@tabler/icons-react";

interface AppSettings {
	allow_system_login: boolean;
}

interface Props {
	onClose: () => void;
}

type Section = "security";

function Toggle({
	checked,
	onChange,
	disabled,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={() => onChange(!checked)}
			disabled={disabled}
			className={`shrink-0 w-[38px] h-[22px] rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/50 ${
				checked ? "bg-blue" : "bg-secondary"
			}`}
		>
			<span
				className={`block w-[16px] h-[16px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
					checked ? "translate-x-[19px]" : "translate-x-[3px]"
				}`}
			/>
		</button>
	);
}

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
		<div className="fixed inset-0 z-[999] flex items-center justify-center p-[16px]">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Panel */}
			<div className="relative z-10 bg-primary border border-secondary rounded-2xl shadow-2xl w-[700px] max-w-full max-h-[75vh] flex overflow-hidden">
				{/* Left sidebar */}
				<div className="w-[190px] shrink-0 border-r border-secondary flex flex-col">
					<div className="px-[14px] pt-[18px] pb-[10px] shrink-0">
						<p className="text-[10px] font-bold tracking-wider text-foreground-sec uppercase">
							Settings
						</p>
					</div>
					<nav className="flex flex-col gap-[2px] px-[8px] pb-[12px]">
						{sections.map(({ id, label, icon: Icon }) => {
							const active = section === id;
							return (
								<button
									key={id}
									onClick={() => setSection(id)}
									className={`w-full flex items-center gap-[8px] px-[10px] py-[7px] rounded-[8px] text-[13px] font-medium transition-colors cursor-pointer ${
										active
											? "bg-blue/10 text-blue"
											: "text-foreground-sec hover:bg-secondary/50 hover:text-foreground"
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
					<div className="flex items-center justify-between px-[20px] py-[14px] border-b border-secondary shrink-0">
						<span className="text-[15px] font-bold text-foreground capitalize">
							{section}
						</span>
						<button
							onClick={onClose}
							className="p-[6px] rounded-[8px] text-foreground-sec hover:text-foreground hover:bg-secondary/50 transition-colors cursor-pointer"
						>
							<IconX size={15} />
						</button>
					</div>

					{/* Content body */}
					<div className="flex-1 overflow-y-auto p-[20px] flex flex-col gap-[10px]">
						{section === "security" &&
							(settings ? (
								<>
									<SettingRow
										title="System login"
										description="Allow /etc/shadow as a fallback when no app credential matches. Disable once your app credentials are set up."
									>
										<Toggle
											checked={settings.allow_system_login}
											onChange={(v) => updateSetting("allow_system_login", v)}
											disabled={saving}
										/>
									</SettingRow>
								</>
							) : (
								<div className="skeleton h-[64px] rounded-xl" />
							))}
					</div>
				</div>
			</div>
		</div>
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
		<div className="flex items-start justify-between gap-[16px] px-[14px] py-[12px] rounded-xl bg-secondary/30">
			<div className="flex-1 min-w-0">
				<p className="text-[13px] font-semibold text-foreground">{title}</p>
				<p className="text-[11px] text-foreground-sec mt-[3px] leading-relaxed">
					{description}
				</p>
			</div>
			<div className="shrink-0 mt-[2px]">{children}</div>
		</div>
	);
}
