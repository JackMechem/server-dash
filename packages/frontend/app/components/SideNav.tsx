"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
	IconHome2, IconMoon, IconSun, IconMoonStars, IconChevronsLeft, IconChevronsRight,
	IconMenu2, IconX, IconKey, IconLogout, IconUsers, IconTerminal2, IconDownload,
	IconChevronDown, IconChevronRight, IconBolt, IconHistory, IconHelpCircle,
	IconCoin, IconPlug, IconBattery4, IconUserCog, IconArrowLeft, IconCheck, IconToggleRight,
	IconAutomation,
} from "@tabler/icons-react";
import { useTheme, useSetTheme, type Theme } from "@/stores/useThemeStore";
import { createPortal } from "react-dom";
import { useHelpMode, useToggleHelpMode } from "@/stores/helpModeStore";
import HelpTooltip from "./HelpTooltip";
import { useFocusedWindowState, requestViewChange } from "@/stores/windowStore";
import { PANEL_SECTIONS, getVisibleSections, type PanelId } from "@/app/components/windows/types";
import { useFeatures } from "@/app/lib/DataProvider";
import { SideNavWidgets } from "./SideNavWidgets";
import { ExportDrawer } from "./AppMenubar";

const COLLAPSED_W = 52;

const SECTION_ICONS: Record<string, React.ElementType> = {
	"power-analytics": IconBolt,
	"devices":         IconToggleRight,
};

const ANALYTICS_ICONS: Record<PanelId, React.ElementType> = {
	dashboard:                IconHome2,
	"analytics-past":         IconHistory,
	"analytics-live":         IconBolt,
	"summary-cost":           IconCoin,
	"summary-power":          IconPlug,
	"summary-energy":         IconBattery4,
	"devices-overview":       IconHome2,
	"devices-jmiot":          IconToggleRight,
	"devices-tapo":           IconPlug,
	"devices-automations":    IconAutomation,
};

interface SideNavProps {
	online: boolean;
	isAuthed?: boolean;
	devConsoleOpen?: boolean;
	onToggleDevConsole?: () => void;
}

// ── Window nav (only shown on /) ──────────────────────────────────────────────

function WindowNav({ collapsed, focusedPanelId }: { collapsed: boolean; focusedPanelId: PanelId | null }) {
	const { tapo } = useFeatures();
	const visibleSections = getVisibleSections(tapo);
	const [openSections, setOpenSections] = useState<Set<string>>(
		new Set(PANEL_SECTIONS.map((s) => s.id))
	);

	const toggleSection = (id: string) => {
		setOpenSections((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	};

	if (collapsed) {
		return (
			<div className="flex flex-col gap-[2px] px-[8px] mt-1">
				<button
					onClick={() => requestViewChange("dashboard")}
					title="Dashboard"
					className={[
						"w-full flex items-center justify-center py-[7px] rounded-[8px] transition-colors cursor-pointer",
						focusedPanelId === "dashboard"
							? "bg-blue/10 text-blue"
							: "text-foreground-sec hover:bg-secondary/50 hover:text-foreground",
					].join(" ")}
				>
					<IconHome2 size={15} strokeWidth={focusedPanelId === "dashboard" ? 2.5 : 2} className="shrink-0" />
				</button>
				{visibleSections.flatMap((s) =>
					s.items.map(({ panelId, label }) => {
						const Icon = ANALYTICS_ICONS[panelId];
						const active = focusedPanelId === panelId;
						return (
							<button
								key={panelId}
								onClick={() => requestViewChange(panelId)}
								title={label}
								className={[
									"w-full flex items-center justify-center py-[7px] rounded-[8px] transition-colors cursor-pointer",
									active
										? "bg-blue/10 text-blue"
										: "text-foreground-sec hover:bg-secondary/50 hover:text-foreground",
								].join(" ")}
							>
								<Icon size={15} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
							</button>
						);
					})
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-[1px] px-[8px] mt-1">
			<HelpTooltip text="Switch to the main dashboard showing live system stats and power usage." block>
				<button
					onClick={() => requestViewChange("dashboard")}
					className={[
						"w-full flex items-center gap-[8px] px-[10px] py-[7px] text-[13px] rounded-[8px] transition-colors cursor-pointer font-medium",
						focusedPanelId === "dashboard"
							? "bg-blue/10 text-blue font-semibold"
							: "text-foreground-sec hover:bg-secondary/50 hover:text-foreground",
					].join(" ")}
				>
					<IconHome2 size={14} strokeWidth={focusedPanelId === "dashboard" ? 2.5 : 2} className="shrink-0" />
					Dashboard
				</button>
			</HelpTooltip>

			{visibleSections.map((section) => {
				const SectionIcon = SECTION_ICONS[section.id] ?? IconBolt;
				const isOpen = openSections.has(section.id);

				return (
					<div key={section.id}>
						<HelpTooltip text={`Expand or collapse the ${section.label} section.`} block>
							<button
								onClick={() => toggleSection(section.id)}
								className="w-full flex items-center gap-[8px] px-[10px] py-[5px] rounded-[8px] text-[11px] font-semibold text-foreground-sec hover:bg-secondary/40 hover:text-foreground transition-colors cursor-pointer select-none"
							>
								<SectionIcon size={13} className="shrink-0" />
								<span className="flex-1 text-left">{section.label}</span>
								<IconChevronDown
									size={11}
									className="shrink-0 transition-transform duration-200"
									style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
								/>
							</button>
						</HelpTooltip>

						{isOpen && (
							<div className="flex flex-col gap-[1px] pl-[6px]">
								{section.items.map(({ panelId, label }) => {
									const Icon = ANALYTICS_ICONS[panelId];
									const active = focusedPanelId === panelId;
									return (
										<HelpTooltip key={panelId} text={`Open the ${label} analytics chart.`} block>
											<button
												onClick={() => requestViewChange(panelId)}
												className={[
													"w-full flex items-center gap-[8px] px-[10px] py-[6px] text-[12px] rounded-[8px] transition-colors cursor-pointer",
													active
														? "bg-blue/10 text-blue font-semibold"
														: "text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground font-medium",
												].join(" ")}
											>
												<Icon size={13} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
												{label}
											</button>
										</HelpTooltip>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ── Desktop sidebar ───────────────────────────────────────────────────────────

const SideNav = ({ online, isAuthed, devConsoleOpen, onToggleDevConsole }: SideNavProps) => {
	const pathname = usePathname();
	const router = useRouter();
	const theme = useTheme();
	const setTheme = useSetTheme();
	const helpMode = useHelpMode();
	const toggleHelp = useToggleHelpMode();
	const [collapsed, setCollapsed] = useState(false);
	const [sidebarWidth, setSidebarWidth] = useState(220);
	const [menuOpen, setMenuOpen] = useState(false);
	const [auth, setAuth] = useState<boolean | null>(isAuthed ?? null);
	const [hostname, setHostname] = useState<string>("");
	const [exportOpen, setExportOpen] = useState(false);
	const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
	const [themeDropdownPos, setThemeDropdownPos] = useState<{ x: number; y: number } | null>(null);
	const themeButtonRef = useRef<HTMLButtonElement>(null);
	const themeDropdownRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const { panelId: focusedPanelId } = useFocusedWindowState();
	const { tapo } = useFeatures();
	const visibleSections = getVisibleSections(tapo);
	const isHome = pathname === "/";

	useEffect(() => { setMenuOpen(false); }, [pathname]);

	useEffect(() => {
		if (isAuthed !== undefined) return;
		fetch("/api/auth/check").then((r) => setAuth(r.ok)).catch(() => setAuth(false));
	}, [isAuthed]);

	useEffect(() => {
		fetch("/api/stats").then((r) => r.json()).then((d) => setHostname(d.hostname ?? "")).catch(() => {});
	}, []);

	useEffect(() => {
		if (!themeDropdownOpen) return;
		const close = (e: MouseEvent) => {
			const t = e.target as Node;
			if (!themeButtonRef.current?.contains(t) && !themeDropdownRef.current?.contains(t)) {
				setThemeDropdownOpen(false);
			}
		};
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [themeDropdownOpen]);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!isDragging.current || !wrapperRef.current) return;
			const left = wrapperRef.current.getBoundingClientRect().left;
			setSidebarWidth(Math.max(180, Math.min(400, e.clientX - left)));
		};
		const onUp = () => { isDragging.current = false; };
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
	}, []);

	async function handleLogout() {
		await fetch("/api/auth/logout", { method: "POST" });
		router.push("/auth");
	}

	const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
		{ value: "light", label: "Light", icon: IconSun },
		{ value: "dark",  label: "Dark",  icon: IconMoon },
		{ value: "black", label: "Black", icon: IconMoonStars },
	];

	const currentThemeIcon = THEME_OPTIONS.find((o) => o.value === theme)?.icon ?? IconSun;
	const CurrentThemeIcon = currentThemeIcon;

	function openThemeDropdown(e: React.MouseEvent<HTMLButtonElement>) {
		const rect = e.currentTarget.getBoundingClientRect();
		const dropH = 120; // ~3 items
		const y = Math.min(rect.top, window.innerHeight - dropH - 8);
		setThemeDropdownPos({ x: rect.right + 8, y });
		setThemeDropdownOpen((v) => !v);
	}

	const themeDropdown = themeDropdownOpen && themeDropdownPos && typeof document !== "undefined"
		? createPortal(
			<div
				ref={themeDropdownRef}
				style={{ position: "fixed", left: themeDropdownPos.x, top: themeDropdownPos.y, zIndex: 9999 }}
				className="w-[130px] bg-card border border-border rounded-xl shadow-xl py-1 overflow-hidden"
			>
				{THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
					<button
						key={value}
						onClick={() => { setTheme(value); setThemeDropdownOpen(false); }}
						className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors cursor-pointer ${
							theme === value
								? "text-foreground bg-primary/20"
								: "text-muted-foreground hover:text-foreground hover:bg-muted/50"
						}`}
					>
						<Icon size={14} className="shrink-0" />
						{label}
						{theme === value && <IconCheck size={12} className="ml-auto shrink-0" />}
					</button>
				))}
			</div>,
			document.body
		)
		: null;

	const navItemClass = (active: boolean, col: boolean) =>
		"w-full flex items-center rounded-[8px] transition-colors cursor-pointer " +
		(col
			? "justify-center py-[7px] "
			: "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap ") +
		(active
			? "bg-blue/10 text-blue font-semibold"
			: "text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground font-medium");

	return (
		<>
			{/* Desktop sidebar */}
			<div ref={wrapperRef} className="hidden lg:flex flex-row shrink-0 select-none">
				<div
					style={{ width: collapsed ? COLLAPSED_W : sidebarWidth, minWidth: collapsed ? COLLAPSED_W : 180 }}
					className="flex flex-col py-[16px] overflow-hidden transition-[width] duration-200"
				>
					{/* Logo + identity header */}
					<div className="shrink-0 px-[14px] mb-[14px]">
						{/* Collapsed: centered logo only */}
						<Link href="/" className={collapsed ? "flex justify-center" : "hidden"}>
							<img src="/logo.svg" alt="logo" className="max-h-[24px]" />
						</Link>
						{/* Expanded: logo + name + status */}
						<div className={collapsed ? "hidden" : "flex items-center gap-[10px]"}>
							<Link href="/" className="shrink-0">
								<img src="/logo.svg" alt="logo" className="max-h-[36px]" />
							</Link>
							<div className="flex flex-col min-w-0">
								<span className="text-[14px] font-bold text-foreground leading-tight truncate">Jack Mechem</span>
								{hostname && <span className="text-[11px] text-foreground-sec leading-tight truncate">{hostname}</span>}
								<div className="flex items-center gap-[5px] mt-[3px]">
									<span className="w-[6px] h-[6px] rounded-full shrink-0"
										style={{ background: online ? "#5dd776" : "#7b899a", animation: online ? "pulse-dot 2s infinite" : "none" }} />
									<span className="text-[11px] text-foreground-sec">{online ? "Online" : "Connecting..."}</span>
								</div>
							</div>
						</div>
					</div>

					{/* Back to home — shown when not on the home route */}
					{!isHome && (
						<div className="px-[8px] mb-[4px] shrink-0">
							<Link
								href="/"
								title={collapsed ? "Back to dashboard" : undefined}
								className={navItemClass(false, collapsed)}
							>
								<IconArrowLeft size={16} className="shrink-0" />
								{!collapsed && "Back to dashboard"}
							</Link>
						</div>
					)}

					{/* Auth/users route links */}
					<nav className="flex flex-col px-[8px] shrink-0">
						{auth === false && (() => {
							const active = pathname === "/auth";
							return (
								<Link href="/auth" title={collapsed ? "Auth" : undefined} className={navItemClass(active, collapsed)}>
									<IconKey size={16} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
									{!collapsed && "Auth"}
								</Link>
							);
						})()}
						{auth && (() => {
							const pageItemClass = (active: boolean) =>
								"w-full flex items-center rounded-[9px] transition-all cursor-pointer border " +
								(collapsed ? "justify-center py-[7px] " : "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap ") +
								(active
									? "bg-blue/10 border-blue/25 text-blue font-semibold shadow-sm shadow-blue/10"
									: "text-foreground-sec border-transparent hover:bg-secondary/60 hover:border-secondary hover:text-foreground font-medium");

							return (
								<>
									{!collapsed && (
										<p className="px-[2px] mb-[5px] mt-[2px] text-[11px] font-semibold text-foreground-sec/60">
											Pages
										</p>
									)}
									<div className="flex flex-col gap-[4px]">
										{(() => {
											const active = pathname === "/users";
											return (
												<Link href="/users" title={collapsed ? "User Management" : undefined} className={pageItemClass(active)}>
													<IconUsers size={16} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
													{!collapsed && <><span className="flex-1">User Management</span>{isHome && <IconChevronRight size={13} className="shrink-0 opacity-40" />}</>}
												</Link>
											);
										})()}
										{(() => {
											const active = pathname === "/account";
											return (
												<Link href="/account" title={collapsed ? "Account" : undefined} className={pageItemClass(active)}>
													<IconUserCog size={16} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
													{!collapsed && <><span className="flex-1">Account</span>{isHome && <IconChevronRight size={13} className="shrink-0 opacity-40" />}</>}
												</Link>
											);
										})()}
									</div>
								</>
							);
						})()}
					</nav>

					{/* Window sections — only on home route */}
					{isHome && (
						<>
							{(auth !== null) && <div className="mx-[8px] my-[8px] border-t border-secondary shrink-0" />}
							{!collapsed && (
								<p className="px-[18px] mb-[4px] text-[11px] font-semibold text-foreground-sec/60 shrink-0">
									Views
								</p>
							)}
							<div className="flex-none overflow-y-auto">
								<WindowNav collapsed={collapsed} focusedPanelId={focusedPanelId} />
							</div>
						</>
					)}

					{/* Widgets */}
					{!collapsed && (
						<>
							<div className="mx-[8px] my-[8px] border-t border-secondary shrink-0" />
							<SideNavWidgets />
						</>
					)}

					{/* Spacer — pushes bottom section down */}
					<div className="mt-auto" />

					{/* Online dot — only shown when collapsed (header handles expanded state) */}
					{collapsed && (
						<div className="px-[8px] mb-[2px] shrink-0">
							<div title={online ? "Online" : "Connecting..."} className="w-full flex justify-center py-[7px]">
								<span className="w-[7px] h-[7px] rounded-full shrink-0"
									style={{ background: online ? "#5dd776" : "#7b899a", animation: online ? "pulse-dot 2s infinite" : "none" }} />
							</div>
						</div>
					)}

					{/* Logout */}
					{auth && (
						<div className="px-[8px] shrink-0">
							<HelpTooltip text="Sign out of your account and return to the login screen." block hidden={collapsed}>
								<button onClick={handleLogout} title={collapsed ? "Log out" : undefined}
									className={"w-full flex items-center rounded-[8px] transition-colors cursor-pointer font-medium text-red-400 hover:bg-red-500/10 " +
										(collapsed ? "justify-center py-[7px]" : "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap")}>
									<IconLogout size={16} className="shrink-0" />
									{!collapsed && "Log out"}
								</button>
							</HelpTooltip>
						</div>
					)}

					{/* Theme picker */}
					<div className="px-[8px] mt-[4px] shrink-0">
						<HelpTooltip text="Switch color theme: Light, Dark, or Black." block hidden={collapsed}>
							<button
								ref={themeButtonRef}
								onClick={openThemeDropdown}
								title={collapsed ? "Color theme" : undefined}
								className={"w-full flex items-center rounded-[8px] transition-colors cursor-pointer text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium " +
									(collapsed ? "justify-center py-[7px]" : "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap")}
							>
								<CurrentThemeIcon size={16} className="shrink-0" />
								{!collapsed && <span className="capitalize">{theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Black"}</span>}
								{!collapsed && <IconChevronDown size={12} className="ml-auto shrink-0 opacity-50" />}
							</button>
						</HelpTooltip>
					</div>

					{/* Help mode toggle */}
					<div className="px-[8px] shrink-0">
						<HelpTooltip text="Toggle help mode — shows a ? badge next to every button explaining what it does." block hidden={collapsed}>
							<button onClick={toggleHelp} title={collapsed ? "Help mode" : undefined}
								className={"w-full flex items-center rounded-[8px] transition-colors cursor-pointer font-medium " +
									(collapsed ? "justify-center py-[7px]" : "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap ") +
									(helpMode ? "text-blue bg-blue/10" : "text-foreground-sec hover:bg-secondary/50 hover:text-foreground")}>
								<IconHelpCircle size={16} className="shrink-0" />
								{!collapsed && "Help mode"}
							</button>
						</HelpTooltip>
					</div>

					{/* Divider + collapse */}
					<div className="mx-[8px] my-[8px] border-t border-secondary shrink-0" />
					<div className="px-[8px] shrink-0">
						<HelpTooltip text="Collapse the sidebar to icons only to give more space to the main content." block hidden={collapsed}>
							<button onClick={() => setCollapsed((c) => !c)}
								title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
								className={"w-full flex items-center rounded-[8px] transition-colors cursor-pointer text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium " +
									(collapsed ? "justify-center py-[7px]" : "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap")}>
								{collapsed
									? <IconChevronsRight size={16} className="shrink-0" />
									: <IconChevronsLeft size={16} className="shrink-0" />}
								{!collapsed && "Collapse"}
							</button>
						</HelpTooltip>
					</div>
				</div>

				{/* Drag handle */}
				{!collapsed && (
					<div onMouseDown={(e) => { isDragging.current = true; e.preventDefault(); }}
						className="w-[10px] shrink-0 flex items-center justify-center cursor-col-resize group">
						<div className="w-[3px] h-[40px] rounded-full bg-blue/20 transition-colors" />
					</div>
				)}
			</div>

			{/* Mobile header */}
			<div className="lg:hidden fixed top-0 left-0 right-0 z-[998] h-[52px] bg-card border-b border-border flex items-center px-[16px]">
				<Link href="/" onClick={() => setMenuOpen(false)}>
					<img src="/logo.svg" alt="logo" className="max-h-[22px]" />
				</Link>
				<HelpTooltip text="Open or close the navigation menu.">
					<button onClick={() => setMenuOpen((o) => !o)}
						className="ml-auto p-[11px] rounded-[8px] text-foreground-sec hover:bg-secondary/50 hover:text-foreground transition-colors cursor-pointer">
						{menuOpen ? <IconX size={18} /> : <IconMenu2 size={18} />}
					</button>
				</HelpTooltip>
			</div>

			{/* Mobile dropdown menu */}
			{menuOpen && (
				<>
				{/* Backdrop — tap outside to close */}
				<div
					className="lg:hidden fixed inset-0 top-[52px] z-[998]"
					onClick={() => setMenuOpen(false)}
				/>
				<div className="lg:hidden fixed top-[52px] left-0 right-0 bottom-0 z-[999] bg-card border-t border-border shadow-2xl overflow-y-auto">
					{!isHome && (
						<nav className="flex flex-col gap-[2px] p-[8px]">
							<Link href="/" onClick={() => setMenuOpen(false)}
								className="w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] transition-colors cursor-pointer text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground font-medium">
								<IconArrowLeft size={16} className="shrink-0" />
								Back to dashboard
							</Link>
						</nav>
					)}
					{auth === false && (
						<nav className="flex flex-col gap-[2px] p-[8px]">
							<Link href="/auth" onClick={() => setMenuOpen(false)}
								className={"w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] transition-colors cursor-pointer " +
									(pathname === "/auth" ? "bg-blue/10 text-blue font-semibold" : "text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground font-medium")}>
								<IconKey size={16} strokeWidth={pathname === "/auth" ? 2.5 : 2} className="shrink-0" />
								Auth
							</Link>
						</nav>
					)}
					{auth && (
						<nav className="flex flex-col gap-[2px] p-[8px]">
							<Link href="/users" onClick={() => setMenuOpen(false)}
								className={"w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] transition-colors cursor-pointer " +
									(pathname === "/users" ? "bg-blue/10 text-blue font-semibold" : "text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground font-medium")}>
								<IconUsers size={16} strokeWidth={pathname === "/users" ? 2.5 : 2} className="shrink-0" />
								User Management
							</Link>
							<Link href="/account" onClick={() => setMenuOpen(false)}
								className={"w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] transition-colors cursor-pointer " +
									(pathname === "/account" ? "bg-blue/10 text-blue font-semibold" : "text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground font-medium")}>
								<IconUserCog size={16} strokeWidth={pathname === "/account" ? 2.5 : 2} className="shrink-0" />
								Account
							</Link>
						</nav>
					)}

					{/* Mobile window sections */}
					{isHome && (
						<>
							<div className="mx-[8px] border-t border-border" />
							<div className="p-[8px]">
								<p className="px-[10px] mb-[4px] text-[11px] font-semibold text-foreground-sec/60">
									Views
								</p>
								{/* Dashboard */}
								<HelpTooltip text="Switch to the main dashboard showing live system stats and power usage." block>
									<button
										onClick={() => { requestViewChange("dashboard"); setMenuOpen(false); }}
										className={"w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] transition-colors cursor-pointer " +
											(focusedPanelId === "dashboard" ? "bg-blue/10 text-blue font-semibold" : "text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground font-medium")}>
										<IconHome2 size={15} strokeWidth={focusedPanelId === "dashboard" ? 2.5 : 2} className="shrink-0" />
										Dashboard
									</button>
								</HelpTooltip>
								{/* Sections */}
								{visibleSections.map((section) => (
									<div key={section.id} className="mb-1 mt-2">
										<p className="px-[10px] py-[4px] text-[11px] font-semibold text-foreground-sec/60">
											{section.label}
										</p>
										{section.items.map(({ panelId, label }) => {
											const Icon = ANALYTICS_ICONS[panelId];
											const active = focusedPanelId === panelId;
											return (
												<HelpTooltip key={panelId} text={`Open the ${label} analytics chart.`} block>
													<button
														onClick={() => { requestViewChange(panelId); setMenuOpen(false); }}
														className={"w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] transition-colors cursor-pointer " +
															(active ? "bg-blue/10 text-blue font-semibold" : "text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground font-medium")}>
														<Icon size={15} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
														{label}
													</button>
												</HelpTooltip>
											);
										})}
									</div>
								))}
							</div>
						</>
					)}

					<div className="mx-[8px] border-t border-border" />
					<div className="p-[8px] flex flex-col gap-[2px]">
						<p className="px-[10px] mb-[2px] mt-[2px] text-[11px] font-semibold text-foreground-sec/60">
							More
						</p>
						<button
							onClick={() => { setExportOpen(true); setMenuOpen(false); }}
							className="w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] transition-colors cursor-pointer text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground font-medium"
						>
							<IconDownload size={16} className="shrink-0" />
							Export Data
						</button>
						{auth && onToggleDevConsole && (
							<button
								onClick={() => { onToggleDevConsole(); setMenuOpen(false); }}
								className={"w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] transition-colors cursor-pointer font-medium " +
									(devConsoleOpen ? "bg-blue/10 text-blue" : "text-foreground-sec hover:bg-secondary/50 hover:text-foreground")}
							>
								<IconTerminal2 size={16} className="shrink-0" />
								Dev Console
							</button>
						)}
					</div>

					<div className="mx-[8px] border-t border-border" />
					<div className="p-[8px] flex flex-col gap-[2px]">
						{auth && (
							<HelpTooltip text="Sign out of your account and return to the login screen." block>
								<button onClick={handleLogout}
									className="w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors cursor-pointer font-medium">
									<IconLogout size={16} className="shrink-0" />
									Log out
								</button>
							</HelpTooltip>
						)}
						<HelpTooltip text="Switch color theme: Light, Dark, or Black." block>
							<div className="flex flex-col gap-0.5">
								{THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
									<button
										key={value}
										onClick={() => { setTheme(value); setMenuOpen(false); }}
										className={`w-full flex items-center gap-[12px] px-[14px] py-[11px] text-[15px] rounded-[10px] transition-colors cursor-pointer font-medium ${
											theme === value
												? "text-foreground bg-primary/20"
												: "text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground"
										}`}
									>
										<Icon size={16} className="shrink-0" />
										{label}
										{theme === value && <IconCheck size={14} className="ml-auto shrink-0" />}
									</button>
								))}
							</div>
						</HelpTooltip>
						<HelpTooltip text="Toggle help mode — shows a ? badge next to every button explaining what it does." block>
							<button onClick={() => { toggleHelp(); setMenuOpen(false); }}
								className={"w-full flex items-center gap-[12px] px-[14px] py-[13px] text-[15px] rounded-[10px] transition-colors cursor-pointer font-medium " +
									(helpMode ? "text-blue bg-blue/10" : "text-foreground-sec hover:bg-secondary/50 active:bg-secondary/70 hover:text-foreground")}>
								<IconHelpCircle size={16} className="shrink-0" />
								Help mode
							</button>
						</HelpTooltip>
					</div>
					{/* Bottom safe area */}
					<div className="h-6" />
				</div>
				</>
			)}

			{themeDropdown}

			<ExportDrawer open={exportOpen} onOpenChange={setExportOpen} panelId={focusedPanelId} />
		</>
	);
};

export default SideNav;
