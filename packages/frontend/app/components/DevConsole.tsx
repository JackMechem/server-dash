"use client";

import { useEffect, useRef, useState } from "react";
import {
	IconX, IconTerminal2, IconSend, IconTrash, IconChevronDown,
	IconCircleFilled, IconClockHour4,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
	onClearLogs: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tryPretty(text: string): string {
	try { return JSON.stringify(JSON.parse(text), null, 2); }
	catch { return text; }
}

const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
	GET:    { bg: "bg-blue/15",    text: "text-blue" },
	POST:   { bg: "bg-green-500/15", text: "text-green-400" },
	PUT:    { bg: "bg-amber-500/15", text: "text-amber-400" },
	PATCH:  { bg: "bg-purple-500/15", text: "text-purple-400" },
	DELETE: { bg: "bg-red-500/15",   text: "text-red-400" },
};

function MethodBadge({ method }: { method: string }) {
	const colors = METHOD_COLORS[method] ?? { bg: "bg-muted/50", text: "text-muted-foreground" };
	return (
		<span className={cn(
			"inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold shrink-0 w-[46px]",
			colors.bg, colors.text
		)}>
			{method}
		</span>
	);
}

function StatusBadge({ status }: { status: number | null }) {
	if (status === null) return <span className="text-[11px] font-mono text-muted-foreground/50 w-8 text-right shrink-0">···</span>;
	const color = status >= 200 && status < 300
		? "text-green-400"
		: status >= 400 ? "text-red-400"
		: "text-amber-400";
	return <span className={cn("text-[11px] font-mono font-semibold w-8 text-right shrink-0", color)}>{status}</span>;
}

// ── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ entry, expanded, onToggle }: {
	entry: LogEntry;
	expanded: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="border-b border-border/50 last:border-0">
			<button
				onClick={onToggle}
				className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors group"
			>
				<MethodBadge method={entry.method} />
				<StatusBadge status={entry.status} />
				<span className="flex-1 font-mono text-[11px] text-foreground truncate min-w-0">
					{entry.path}
				</span>
				{entry.duration !== null && (
					<span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono">
						{entry.duration}ms
					</span>
				)}
				<span className="text-[10px] text-muted-foreground/40 shrink-0">
					{entry.timestamp}
				</span>
				<IconChevronDown
					size={11}
					className={cn(
						"shrink-0 text-muted-foreground/40 transition-transform duration-150",
						expanded && "rotate-180"
					)}
				/>
			</button>

			{expanded && (
				<div className="px-3 pb-3 bg-muted/20 border-t border-border/40">
					<p className="font-mono text-[10px] text-muted-foreground/60 pt-2 pb-2 break-all">
						{entry.url}
					</p>
					{entry.response !== null && (
						<pre className="text-[11px] font-mono text-foreground/80 bg-card border border-border rounded-lg p-3 overflow-auto max-h-[240px] whitespace-pre-wrap break-all leading-relaxed">
							{tryPretty(entry.response)}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }));

export default function DevConsole({
	open, width, isMobile, onClose, onWidthChange, logs, onClearLogs,
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
			onWidthChange(Math.max(300, Math.min(900, dragRef.current.startWidth + delta)));
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
			const fetchUrl = isAbsolute ? "/api/dev/proxy" : reqUrl;
			const fetchInit: RequestInit = isAbsolute
				? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: reqMethod, url: reqUrl, body: reqBody || undefined }) }
				: { method: reqMethod, headers: reqBody ? { "Content-Type": "application/json" } : {}, body: ["POST", "PUT", "PATCH"].includes(reqMethod) && reqBody ? reqBody : undefined };
			const res = await fetch(fetchUrl, fetchInit);
			setReqResponse({ status: res.status, body: tryPretty(await res.text()) });
		} catch (e) {
			setReqResponse({ status: 0, body: String(e) });
		} finally {
			setReqLoading(false);
		}
	}

	const panelStyle: React.CSSProperties = {
		position: "fixed",
		top: 0,
		right: 0,
		bottom: 0,
		left: isMobile ? "0" : "auto",
		width: isMobile ? "100%" : `${width}px`,
		zIndex: 50,
		transform: open ? "translateX(0)" : "translateX(100%)",
		transition: "transform 280ms cubic-bezier(0.4,0,0.2,1)",
	};

	return (
		<div style={panelStyle} className="flex flex-col bg-card border-l border-border shadow-2xl">

			{/* Drag handle */}
			{!isMobile && (
				<div
					className="absolute left-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 group"
					onMouseDown={(e) => {
						e.preventDefault();
						dragRef.current = { startX: e.clientX, startWidth: width };
						document.body.style.userSelect = "none";
						document.body.style.cursor = "col-resize";
					}}
				>
					<div className="absolute left-0 top-0 bottom-0 w-px bg-border group-hover:bg-blue/50 transition-colors" />
				</div>
			)}

			{/* Header */}
			<div className="shrink-0 flex items-center gap-2 px-4 h-10 border-b border-border bg-card">
				<IconTerminal2 size={13} className="text-muted-foreground shrink-0" />
				<span className="text-[12px] font-semibold text-foreground select-none">Dev Console</span>

				{/* Tabs */}
				<div className="flex items-center gap-0.5 ml-4">
					{(["logs", "request"] as const).map((tab) => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={cn(
								"px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer",
								activeTab === tab
									? "bg-secondary text-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-muted/40"
							)}
						>
							{tab === "logs" ? `Logs${logs.length > 0 ? ` (${logs.length})` : ""}` : "Request"}
						</button>
					))}
				</div>

				{/* Actions */}
				<div className="ml-auto flex items-center gap-1">
					{activeTab === "logs" && logs.length > 0 && (
						<Button variant="ghost" size="xs" onClick={onClearLogs} className="gap-1 text-muted-foreground hover:text-foreground">
							<IconTrash size={11} />
							Clear
						</Button>
					)}
					<Button variant="ghost" size="xs" onClick={onClose} className="text-muted-foreground hover:text-foreground">
						<IconX size={13} />
					</Button>
				</div>
			</div>

			{/* ── Logs tab ── */}
			{activeTab === "logs" && (
				<div className="flex-1 overflow-y-auto">
					{logs.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/50">
							<IconClockHour4 size={28} strokeWidth={1.5} />
							<p className="text-[12px]">No requests captured yet</p>
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

			{/* ── Request tab ── */}
			{activeTab === "request" && (
				<div className="flex-1 flex flex-col overflow-hidden">
					{/* Builder */}
					<div className="shrink-0 p-3 border-b border-border flex flex-col gap-2.5">
						<div className="flex gap-2">
							<Select
								value={reqMethod}
								onValueChange={setReqMethod}
								options={HTTP_METHODS}
								size="sm"
								className="w-[90px] shrink-0 font-mono"
							/>
							<Input
								value={reqUrl}
								onChange={(e) => setReqUrl(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && sendRequest()}
								placeholder="/api/power"
								className="flex-1 font-mono text-[12px] min-w-0"
							/>
							<Button size="sm" onClick={sendRequest} disabled={reqLoading} className="gap-1.5 shrink-0">
								<IconSend size={12} />
								Send
							</Button>
						</div>

						{["POST", "PUT", "PATCH"].includes(reqMethod) && (
							<Textarea
								value={reqBody}
								onChange={(e) => setReqBody(e.target.value)}
								placeholder='{"key": "value"}'
								rows={4}
								className="font-mono text-[12px] resize-y"
							/>
						)}

						<p className="text-[10px] text-muted-foreground/50 leading-relaxed">
							Bearer token attached via cookie ·{" "}
							use <code className="text-blue font-mono">http://localhost:3001/path</code>{" "}
							to bypass Next.js proxy
						</p>
					</div>

					{/* Response */}
					<div className="flex-1 overflow-auto p-3 bg-muted/10">
						{reqLoading && (
							<div className="flex items-center gap-2 text-[12px] text-muted-foreground">
								<IconCircleFilled size={8} className="text-blue animate-pulse" />
								Sending…
							</div>
						)}
						{!reqLoading && reqResponse && (
							<>
								<div className={cn(
									"text-[11px] font-mono font-semibold mb-3",
									reqResponse.status >= 200 && reqResponse.status < 300 ? "text-green-400" : "text-red-400"
								)}>
									HTTP {reqResponse.status}
								</div>
								<pre className="text-[12px] font-mono text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
									{reqResponse.body}
								</pre>
							</>
						)}
						{!reqLoading && !reqResponse && (
							<p className="text-[12px] text-muted-foreground/40">
								Response will appear here
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
