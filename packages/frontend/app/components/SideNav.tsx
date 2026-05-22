"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
	IconHome2, IconMoon, IconSun, IconChevronsLeft, IconChevronsRight,
	IconMenu2, IconX, IconCode, IconKey, IconLogout, IconUsers, IconChartLine,
	IconChevronDown, IconBolt, IconChartBar, IconChartCandle, IconHelpCircle,
} from "@tabler/icons-react";
import { useSetTheme } from "@/stores/useThemeStore";
import { useHelpMode, useToggleHelpMode } from "@/stores/helpModeStore";
import HelpTooltip from "./HelpTooltip";
import { useFocusedWindowState, requestViewChange } from "@/stores/windowStore";
import { PANEL_SECTIONS, type PanelId } from "@/app/components/windows/types";
import { SideNavWidgets } from "./SideNavWidgets";

const COLLAPSED_W = 52;

const SECTION_ICONS: Record<string, React.ElementType> = {
	"power-analytics": IconBolt,
};

const ANALYTICS_ICONS: Record<PanelId, React.ElementType> = {
	dashboard:           IconHome2,
	"analytics-line":    IconChartLine,
	"analytics-bar":     IconChartBar,
	"analytics-candle":  IconChartCandle,
};

interface SideNavProps {
	online: boolean;
	devConsoleOpen: boolean;
	onToggleDevConsole: () => void;
	isAuthed?: boolean;
}

// ── Window nav (only shown on /) ──────────────────────────────────────────────

function WindowNav({ collapsed, focusedPanelId }: { collapsed: boolean; focusedPanelId: PanelId | null }) {
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
				{PANEL_SECTIONS.flatMap((s) =>
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

			{PANEL_SECTIONS.map((section) => {
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
														: "text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium",
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

const SideNav = ({ online, devConsoleOpen, onToggleDevConsole, isAuthed }: SideNavProps) => {
	const pathname = usePathname();
	const router = useRouter();
	const setTheme = useSetTheme();
	const helpMode = useHelpMode();
	const toggleHelp = useToggleHelpMode();
	const [collapsed, setCollapsed] = useState(false);
	const [sidebarWidth, setSidebarWidth] = useState(220);
	const [menuOpen, setMenuOpen] = useState(false);
	const [auth, setAuth] = useState<boolean | null>(isAuthed ?? null);
	const isDragging = useRef(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const { panelId: focusedPanelId } = useFocusedWindowState();
	const isHome = pathname === "/";

	useEffect(() => { setMenuOpen(false); }, [pathname]);

	useEffect(() => {
		if (isAuthed !== undefined) return;
		fetch("/api/auth/check").then((r) => setAuth(r.ok)).catch(() => setAuth(false));
	}, [isAuthed]);

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

	const navItemClass = (active: boolean, col: boolean) =>
		"w-full flex items-center rounded-[8px] transition-colors cursor-pointer " +
		(col
			? "justify-center py-[7px] "
			: "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap ") +
		(active
			? "bg-blue/10 text-blue font-semibold"
			: "text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium");

	return (
		<>
			{/* Desktop sidebar */}
			<div ref={wrapperRef} className="hidden lg:flex flex-row shrink-0 select-none">
				<div
					style={{ width: collapsed ? COLLAPSED_W : sidebarWidth, minWidth: collapsed ? COLLAPSED_W : 180 }}
					className="flex flex-col py-[16px] overflow-hidden transition-[width] duration-200"
				>
					{/* Logo */}
					<div className={collapsed ? "flex justify-center mb-[12px] shrink-0" : "px-[16px] mb-[16px] shrink-0"}>
						<Link href="/">
							<img src="/logo.svg" alt="logo" className={collapsed ? "max-h-[24px]" : "max-h-[36px]"} />
						</Link>
					</div>

					{/* Auth/users route links */}
					<nav className="flex flex-col gap-[2px] px-[8px] shrink-0">
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
							const active = pathname === "/users";
							return (
								<Link href="/users" title={collapsed ? "User Management" : undefined} className={navItemClass(active, collapsed)}>
									<IconUsers size={16} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
									{!collapsed && "User Management"}
								</Link>
							);
						})()}
					</nav>

					{/* Window sections — only on home route */}
					{isHome && (
						<>
							{(auth !== null) && <div className="mx-[8px] my-[8px] border-t border-secondary shrink-0" />}
							{!collapsed && (
								<p className="px-[18px] mb-[4px] text-[10px] font-semibold text-foreground-sec/60 uppercase tracking-wider shrink-0">
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

					{/* Online status */}
					<div className="px-[8px] mb-[2px] shrink-0 mt-auto">
						<div title={collapsed ? (online ? "Online" : "Connecting...") : undefined}
							className={"w-full flex items-center rounded-[8px] font-medium text-foreground-sec " +
								(collapsed ? "justify-center py-[7px]" : "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap")}>
							<span className="w-[7px] h-[7px] rounded-full shrink-0"
								style={{ background: online ? "#5dd776" : "#7b899a", animation: online ? "pulse-dot 2s infinite" : "none" }} />
							{!collapsed && (online ? "Online" : "Connecting...")}
						</div>
					</div>

					{/* Dev console */}
					{auth && (
						<div className="px-[8px] shrink-0">
							<HelpTooltip text="Open the dev console to inspect live API requests and send test requests." block hidden={collapsed}>
								<button onClick={onToggleDevConsole} title={collapsed ? "Dev Console" : undefined}
									className={"w-full flex items-center rounded-[8px] transition-colors cursor-pointer font-medium " +
										(collapsed ? "justify-center py-[7px]" : "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap ") +
										(devConsoleOpen ? "bg-blue/10 text-blue" : "text-foreground-sec hover:bg-secondary/50 hover:text-foreground")}>
									<IconCode size={16} className="shrink-0" />
									{!collapsed && "Dev Console"}
								</button>
							</HelpTooltip>
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

					{/* Theme toggle */}
					<div className="px-[8px] mt-[4px] shrink-0">
						<HelpTooltip text="Switch between light and dark color scheme." block hidden={collapsed}>
							<button onClick={setTheme} title={collapsed ? "Toggle theme" : undefined}
								className={"w-full flex items-center rounded-[8px] transition-colors cursor-pointer text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium " +
									(collapsed ? "justify-center py-[7px]" : "gap-[10px] px-[10px] py-[7px] text-[13px] whitespace-nowrap")}>
								<IconMoon size={16} className="shrink-0 dark-theme:hidden" />
								<IconSun size={16} className="shrink-0 hidden dark-theme:block" />
								{!collapsed && <><span className="dark-theme:hidden">Dark mode</span><span className="hidden dark-theme:block">Light mode</span></>}
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
			<div className="lg:hidden fixed top-0 left-0 right-0 z-[998] h-[52px] bg-primary border-b border-secondary flex items-center px-[16px]">
				<Link href="/" onClick={() => setMenuOpen(false)}>
					<img src="/logo.svg" alt="logo" className="max-h-[22px]" />
				</Link>
				<HelpTooltip text="Open or close the navigation menu.">
					<button onClick={() => setMenuOpen((o) => !o)}
						className="ml-auto p-[7px] rounded-[8px] text-foreground-sec hover:bg-secondary/50 hover:text-foreground transition-colors cursor-pointer">
						{menuOpen ? <IconX size={18} /> : <IconMenu2 size={18} />}
					</button>
				</HelpTooltip>
			</div>

			{/* Mobile dropdown menu */}
			{menuOpen && (
				<div className="lg:hidden fixed top-[52px] left-0 right-0 z-[997] bg-primary border-b border-secondary shadow-xl max-h-[80vh] overflow-y-auto">
					{auth === false && (
						<nav className="flex flex-col gap-[2px] p-[8px]">
							<Link href="/auth" onClick={() => setMenuOpen(false)}
								className={"w-full flex items-center gap-[10px] px-[10px] py-[7px] text-[13px] rounded-[8px] transition-colors cursor-pointer " +
									(pathname === "/auth" ? "bg-blue/10 text-blue font-semibold" : "text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium")}>
								<IconKey size={16} strokeWidth={pathname === "/auth" ? 2.5 : 2} className="shrink-0" />
								Auth
							</Link>
						</nav>
					)}
					{auth && (
						<nav className="flex flex-col gap-[2px] p-[8px]">
							<Link href="/users" onClick={() => setMenuOpen(false)}
								className={"w-full flex items-center gap-[10px] px-[10px] py-[7px] text-[13px] rounded-[8px] transition-colors cursor-pointer " +
									(pathname === "/users" ? "bg-blue/10 text-blue font-semibold" : "text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium")}>
								<IconUsers size={16} strokeWidth={pathname === "/users" ? 2.5 : 2} className="shrink-0" />
								User Management
							</Link>
						</nav>
					)}

					{/* Mobile window sections */}
					{isHome && (
						<>
							<div className="mx-[8px] border-t border-secondary" />
							<div className="p-[8px]">
								<p className="px-[10px] mb-[4px] text-[10px] font-semibold text-foreground-sec/60 uppercase tracking-wider">
									Views
								</p>
								{/* Dashboard */}
								<HelpTooltip text="Switch to the main dashboard showing live system stats and power usage." block>
									<button
										onClick={() => { requestViewChange("dashboard"); setMenuOpen(false); }}
										className={"w-full flex items-center gap-[10px] px-[10px] py-[7px] text-[13px] rounded-[8px] transition-colors cursor-pointer " +
											(focusedPanelId === "dashboard" ? "bg-blue/10 text-blue font-semibold" : "text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium")}>
										<IconHome2 size={15} strokeWidth={focusedPanelId === "dashboard" ? 2.5 : 2} className="shrink-0" />
										Dashboard
									</button>
								</HelpTooltip>
								{/* Sections */}
								{PANEL_SECTIONS.map((section) => (
									<div key={section.id} className="mb-1 mt-2">
										<p className="px-[10px] py-[4px] text-[10px] font-semibold text-foreground-sec uppercase tracking-wider">
											{section.label}
										</p>
										{section.items.map(({ panelId, label }) => {
											const Icon = ANALYTICS_ICONS[panelId];
											const active = focusedPanelId === panelId;
											return (
												<HelpTooltip key={panelId} text={`Open the ${label} analytics chart.`} block>
													<button
														onClick={() => { requestViewChange(panelId); setMenuOpen(false); }}
														className={"w-full flex items-center gap-[10px] px-[10px] py-[7px] text-[13px] rounded-[8px] transition-colors cursor-pointer " +
															(active ? "bg-blue/10 text-blue font-semibold" : "text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium")}>
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

					<div className="mx-[8px] border-t border-secondary" />
					<div className="p-[8px] flex flex-col gap-[2px]">
						{auth && (
							<HelpTooltip text="Open the dev console to inspect live API requests and send test requests." block>
								<button onClick={() => { onToggleDevConsole(); setMenuOpen(false); }}
									className={"w-full flex items-center gap-[10px] px-[10px] py-[7px] text-[13px] rounded-[8px] transition-colors cursor-pointer " +
										(devConsoleOpen ? "bg-blue/10 text-blue font-medium" : "text-foreground-sec hover:bg-secondary/50 hover:text-foreground font-medium")}>
									<IconCode size={16} className="shrink-0" />
									Dev Console
								</button>
							</HelpTooltip>
						)}
						{auth && (
							<HelpTooltip text="Sign out of your account and return to the login screen." block>
								<button onClick={handleLogout}
									className="w-full flex items-center gap-[10px] px-[10px] py-[7px] text-[13px] rounded-[8px] text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer font-medium">
									<IconLogout size={16} className="shrink-0" />
									Log out
								</button>
							</HelpTooltip>
						)}
						<HelpTooltip text="Switch between light and dark color scheme." block>
							<button onClick={setTheme}
								className="w-full flex items-center gap-[10px] px-[10px] py-[7px] text-[13px] rounded-[8px] text-foreground-sec hover:bg-secondary/50 hover:text-foreground transition-colors cursor-pointer font-medium">
								<IconMoon size={16} className="shrink-0 dark-theme:hidden" />
								<IconSun size={16} className="shrink-0 hidden dark-theme:block" />
								<span className="dark-theme:hidden">Dark mode</span>
								<span className="hidden dark-theme:block">Light mode</span>
							</button>
						</HelpTooltip>
						<HelpTooltip text="Toggle help mode — shows a ? badge next to every button explaining what it does." block>
							<button onClick={() => { toggleHelp(); setMenuOpen(false); }}
								className={"w-full flex items-center gap-[10px] px-[10px] py-[7px] text-[13px] rounded-[8px] transition-colors cursor-pointer font-medium " +
									(helpMode ? "text-blue bg-blue/10" : "text-foreground-sec hover:bg-secondary/50 hover:text-foreground")}>
								<IconHelpCircle size={16} className="shrink-0" />
								Help mode
							</button>
						</HelpTooltip>
					</div>
				</div>
			)}
		</>
	);
};

export default SideNav;
