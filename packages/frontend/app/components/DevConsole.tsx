"use client";
import { useEffect, useRef, useState } from "react";
import { LuX, LuTerminal, LuSend } from "react-icons/lu";
import HelpTooltip from "./HelpTooltip";

export interface LogEntry {
	id: number;
	method: string;
	path: string;
	url: string;
	status: number | null;
	duration: number | null;
	timestamp: string;
	response: string | null;
}

interface DevConsoleProps {
	open: boolean;
	width: number;
	isMobile: boolean;
	onClose: () => void;
	onWidthChange: (w: number) => void;
	logs: LogEntry[];
}

function tryPretty(text: string): string {
	try {
		return JSON.stringify(JSON.parse(text), null, 2);
	} catch {
		return text;
	}
}

function methodBg(method: string): string {
	switch (method) {
		case "GET": return "#428ce2";
		case "POST": return "#5dd776";
		case "PUT": return "#f59e0b";
		case "PATCH": return "#7c3aed";
		case "DELETE": return "#ef4444";
		default: return "#7b899a";
	}
}

export default function DevConsole({
	open, width, isMobile, onClose, onWidthChange, logs,
}: DevConsoleProps) {
	const [activeTab, setActiveTab] = useState<"logs" | "request">("logs");
	const [expandedId, setExpandedId] = useState<number | null>(null);
	const [reqMethod, setReqMethod] = useState("GET");
	const [reqUrl, setReqUrl] = useState("/api/power");
	const [reqBody, setReqBody] = useState("");
	const [reqResponse, setReqResponse] = useState<{ status: number; body: string } | null>(null);
	const [reqLoading, setReqLoading] = useState(false);

	const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!dragRef.current) return;
			const delta = dragRef.current.startX - e.clientX;
			const next = Math.max(300, Math.min(900, dragRef.current.startWidth + delta));
			onWidthChange(next);
		};
		const onUp = () => {
			if (!dragRef.current) return;
			dragRef.current = null;
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, [onWidthChange]);

	async function sendRequest() {
		setReqLoading(true);
		setReqResponse(null);
		try {
			const isAbsolute = reqUrl.startsWith("http://") || reqUrl.startsWith("https://");
			let fetchUrl: string;
			let fetchInit: RequestInit;

			if (isAbsolute) {
				fetchUrl = "/api/dev/proxy";
				fetchInit = {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ method: reqMethod, url: reqUrl, body: reqBody || undefined }),
				};
			} else {
				fetchUrl = reqUrl;
				fetchInit = {
					method: reqMethod,
					headers: reqBody ? { "Content-Type": "application/json" } : {},
					body: ["POST", "PUT", "PATCH"].includes(reqMethod) && reqBody ? reqBody : undefined,
				};
			}

			const res = await fetch(fetchUrl, fetchInit);
			const text = await res.text();
			setReqResponse({ status: res.status, body: tryPretty(text) });
		} catch (e) {
			setReqResponse({ status: 0, body: String(e) });
		} finally {
			setReqLoading(false);
		}
	}

	const panelWidth = isMobile ? "100%" : `${width}px`;
	const panelLeft = isMobile ? "0" : "auto";

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				right: 0,
				bottom: 0,
				left: panelLeft,
				width: panelWidth,
				zIndex: 50,
				display: "flex",
				flexDirection: "column",
				background: "var(--color-primary)",
				borderLeft: "1px solid var(--color-secondary)",
				boxShadow: "-4px 0 24px rgba(0,0,0,0.06)",
				transform: open ? "translateX(0)" : "translateX(100%)",
				transition: "transform 280ms cubic-bezier(0.4,0,0.2,1)",
			}}
		>
			{/* Drag handle — desktop only */}
			{!isMobile && (
				<div
					style={{
						position: "absolute",
						left: 0,
						top: 0,
						bottom: 0,
						width: "4px",
						cursor: "col-resize",
						zIndex: 10,
					}}
					onMouseDown={(e) => {
						e.preventDefault();
						dragRef.current = { startX: e.clientX, startWidth: width };
						document.body.style.userSelect = "none";
						document.body.style.cursor = "col-resize";
					}}
				/>
			)}

			{/* Header */}
			<div style={{
				display: "flex",
				alignItems: "center",
				gap: "8px",
				padding: "10px 14px",
				borderBottom: "1px solid var(--color-secondary)",
				flexShrink: 0,
				background: "var(--color-primary)",
			}}>
				<LuTerminal size={13} style={{ color: "var(--color-foreground-sec)" }} />
				<span style={{
					fontSize: "0.65rem",
					fontWeight: 700,
					letterSpacing: "0.1em",
					textTransform: "uppercase",
					color: "var(--color-foreground-sec)",
				}}>
					Dev Console
				</span>

				<div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
					{(["logs", "request"] as const).map((tab) => (
						<HelpTooltip key={tab} text={tab === "logs" ? "View captured API request logs." : "Build and send a custom API request."}>
						<button
							onClick={() => setActiveTab(tab)}
							style={{
								fontSize: "0.68rem",
								fontWeight: 500,
								padding: "3px 9px",
								borderRadius: "6px",
								border: "none",
								cursor: "pointer",
								background: activeTab === tab ? "var(--color-secondary)" : "transparent",
								color: activeTab === tab ? "var(--color-foreground)" : "var(--color-foreground-sec)",
								textTransform: "capitalize",
							}}
						>
							{tab === "logs" ? `Logs${logs.length > 0 ? ` (${logs.length})` : ""}` : "Request"}
						</button>
						</HelpTooltip>
					))}
					<HelpTooltip text="Close the dev console.">
						<button
							onClick={onClose}
							style={{
								marginLeft: "4px",
								background: "transparent",
								border: "none",
								cursor: "pointer",
								color: "var(--color-foreground-sec)",
								display: "flex",
								alignItems: "center",
								padding: "2px",
							}}
						>
							<LuX size={13} />
						</button>
					</HelpTooltip>
				</div>
			</div>

			{/* Logs tab */}
			{activeTab === "logs" && (
				<div style={{ flex: 1, overflowY: "auto", fontFamily: "inherit" }}>
					{logs.length === 0 ? (
						<div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-foreground-sec)", fontSize: "0.75rem" }}>
							No requests captured yet
						</div>
					) : (
						[...logs].reverse().map((entry) => (
							<LogRow
								key={entry.id}
								entry={entry}
								expanded={expandedId === entry.id}
								onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
							/>
						))
					)}
				</div>
			)}

			{/* Request tab */}
			{activeTab === "request" && (
				<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
					<div style={{ padding: "12px", borderBottom: "1px solid var(--color-secondary)", flexShrink: 0 }}>
						<div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
							<select
								value={reqMethod}
								onChange={(e) => setReqMethod(e.target.value)}
								style={{
									background: "var(--color-secondary)",
									border: "1px solid var(--color-secondary)",
									borderRadius: "8px",
									color: "var(--color-foreground)",
									fontSize: "0.68rem",
									padding: "5px 6px",
									cursor: "pointer",
									fontFamily: "inherit",
									outline: "none",
								}}
							>
								{["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
									<option key={m}>{m}</option>
								))}
							</select>
							<input
								value={reqUrl}
								onChange={(e) => setReqUrl(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && sendRequest()}
								placeholder="/api/power"
								style={{
									flex: 1,
									background: "var(--color-secondary)",
									border: "1px solid var(--color-secondary)",
									borderRadius: "8px",
									color: "var(--color-foreground)",
									fontSize: "0.68rem",
									padding: "5px 8px",
									fontFamily: "inherit",
									outline: "none",
									minWidth: 0,
								}}
							/>
							<HelpTooltip text="Send the HTTP request to the API and display the response below.">
								<button
									onClick={sendRequest}
									disabled={reqLoading}
									style={{
										background: "#428ce2",
										border: "none",
										borderRadius: "8px",
										color: "white",
										padding: "5px 11px",
										cursor: reqLoading ? "default" : "pointer",
										display: "flex",
										alignItems: "center",
										gap: "4px",
										fontSize: "0.68rem",
										fontWeight: 500,
										opacity: reqLoading ? 0.6 : 1,
										flexShrink: 0,
									}}
								>
									<LuSend size={11} />
									Send
								</button>
							</HelpTooltip>
						</div>

						{["POST", "PUT", "PATCH"].includes(reqMethod) && (
							<textarea
								value={reqBody}
								onChange={(e) => setReqBody(e.target.value)}
								placeholder='{"key": "value"}'
								rows={4}
								style={{
									width: "100%",
									background: "var(--color-secondary)",
									border: "1px solid var(--color-secondary)",
									borderRadius: "8px",
									color: "var(--color-foreground)",
									fontSize: "0.68rem",
									padding: "6px 8px",
									fontFamily: "inherit",
									resize: "vertical",
									outline: "none",
									boxSizing: "border-box",
									marginBottom: "8px",
								}}
							/>
						)}

						<div style={{ fontSize: "0.6rem", color: "var(--color-foreground-sec)" }}>
							Bearer token attached via cookie ·{" "}
							<span style={{ color: "var(--color-foreground-sec)" }}>use</span>{" "}
							<code style={{ color: "var(--color-blue, #428ce2)" }}>http://localhost:3001/path</code>{" "}
							<span style={{ color: "var(--color-foreground-sec)" }}>to bypass Next.js proxy</span>
						</div>
					</div>

					<div style={{
						flex: 1,
						overflow: "auto",
						padding: "12px",
						fontFamily: "inherit",
						background: "var(--color-secondary)",
					}}>
						{reqLoading && (
							<div style={{ fontSize: "0.7rem", color: "var(--color-foreground-sec)" }}>Sending…</div>
						)}
						{!reqLoading && reqResponse && (
							<>
								<div style={{
									fontSize: "0.65rem",
									fontWeight: 600,
									marginBottom: "8px",
									color: reqResponse.status >= 200 && reqResponse.status < 300 ? "#5dd776" : "#ef4444",
								}}>
									HTTP {reqResponse.status}
								</div>
								<pre style={{
									fontSize: "0.65rem",
									color: "var(--color-foreground-sec)",
									margin: 0,
									whiteSpace: "pre-wrap",
									wordBreak: "break-all",
									lineHeight: 1.6,
								}}>
									{reqResponse.body}
								</pre>
							</>
						)}
						{!reqLoading && !reqResponse && (
							<div style={{ fontSize: "0.7rem", color: "var(--color-foreground-sec)" }}>
								Response will appear here
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function LogRow({
	entry,
	expanded,
	onToggle,
}: {
	entry: LogEntry;
	expanded: boolean;
	onToggle: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	const statusColor =
		entry.status === null
			? "var(--color-foreground-sec)"
			: entry.status >= 200 && entry.status < 300
			? "#5dd776"
			: "#ef4444";

	return (
		<div style={{ borderBottom: "1px solid var(--color-secondary)" }}>
			<div
				onClick={onToggle}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: "8px",
					padding: "6px 12px",
					cursor: "pointer",
					background: hovered ? "var(--color-secondary)" : "transparent",
				}}
			>
				<span style={{
					fontSize: "0.58rem",
					fontWeight: 700,
					padding: "1px 5px",
					borderRadius: "4px",
					minWidth: "38px",
					textAlign: "center",
					background: methodBg(entry.method),
					color: "white",
					flexShrink: 0,
					letterSpacing: "0.02em",
				}}>
					{entry.method}
				</span>
				<span style={{
					fontSize: "0.63rem",
					fontWeight: 600,
					minWidth: "26px",
					textAlign: "right",
					color: statusColor,
					flexShrink: 0,
				}}>
					{entry.status ?? "···"}
				</span>
				<span style={{
					fontSize: "0.68rem",
					color: "var(--color-foreground-sec)",
					flex: 1,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}>
					{entry.path}
				</span>
				<span style={{ fontSize: "0.6rem", color: "var(--color-foreground-sec)", flexShrink: 0 }}>
					{entry.duration !== null ? `${entry.duration}ms` : ""}
				</span>
				<span style={{ fontSize: "0.6rem", color: "var(--color-foreground-sec)", flexShrink: 0, opacity: 0.6 }}>
					{entry.timestamp}
				</span>
			</div>

			{expanded && (
				<div style={{
					background: "var(--color-secondary)",
					padding: "8px 12px 10px",
					borderTop: "1px solid var(--color-secondary)",
				}}>
					<div style={{
						fontSize: "0.6rem",
						color: "var(--color-foreground-sec)",
						marginBottom: "6px",
						wordBreak: "break-all",
					}}>
						{entry.url}
					</div>
					{entry.response !== null && (
						<pre style={{
							fontSize: "0.63rem",
							color: "var(--color-foreground-sec)",
							margin: 0,
							overflow: "auto",
							maxHeight: "220px",
							whiteSpace: "pre-wrap",
							wordBreak: "break-all",
							lineHeight: 1.5,
						}}>
							{(() => {
								try { return JSON.stringify(JSON.parse(entry.response), null, 2); }
								catch { return entry.response; }
							})()}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
