"use client";

import { useEffect, useState, useRef } from "react";
import SideNav from "./components/SideNav";
import WindowManager from "./components/windows/WindowManager";
import DevConsole, { type LogEntry } from "./components/DevConsole";
import { CommandPalette } from "./components/CommandPalette";
import { AppMenubar } from "./components/AppMenubar";

export default function Home() {
	const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
	const [online, setOnline] = useState(false);
	const [mounted, setMounted] = useState(false);
	const [panelOpen, setPanelOpen] = useState(false);
	const [panelWidth, setPanelWidth] = useState(440);
	const [isMobile, setIsMobile] = useState(false);
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const logIdRef = useRef(0);

	useEffect(() => { setMounted(true); }, []);

	useEffect(() => {
		const check = () => setIsMobile(window.innerWidth < 768);
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);

	useEffect(() => {
		fetch("/api/auth/check").then((r) => setIsAuthed(r.ok));
	}, []);

	// Lightweight online check
	useEffect(() => {
		const check = async () => {
			try { setOnline((await fetch("/api/stats")).ok); } catch { setOnline(false); }
		};
		check();
		const id = setInterval(check, 5000);
		return () => clearInterval(id);
	}, []);

	// Dev console fetch logger
	useEffect(() => {
		const original = window.fetch;
		window.fetch = async (input, init) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
					? input.href
					: (input as Request).url;

			const shouldLog =
				(url.startsWith("/api/") && !url.startsWith("/api/dev/proxy")) ||
				url.includes("localhost:3001");

			if (!shouldLog) return original(input, init);

			const method = ((init?.method ?? (input instanceof Request ? input.method : "GET")) as string).toUpperCase();
			const id = ++logIdRef.current;
			let path = url;
			try { path = new URL(url, window.location.origin).pathname; } catch {}
			const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
			const start = Date.now();

			setLogs((prev) => [
				...prev,
				{ id, method, path, url, status: null, duration: null, timestamp, response: null },
			]);

			try {
				const res = await original(input, init);
				const clone = res.clone();
				const text = await clone.text();
				const duration = Date.now() - start;
				setLogs((prev) =>
					prev.map((e) => (e.id === id ? { ...e, status: res.status, duration, response: text } : e)),
				);
				return res;
			} catch (err) {
				const duration = Date.now() - start;
				setLogs((prev) =>
					prev.map((e) => (e.id === id ? { ...e, status: 0, duration, response: String(err) } : e)),
				);
				throw err;
			}
		};
		return () => { window.fetch = original; };
	}, []);

	return (
		<div className="w-full h-full bg-primary text-foreground overflow-hidden flex flex-col">
			{mounted && (
				<AppMenubar
					isAuthed={!!isAuthed}
					devConsoleOpen={panelOpen}
					onToggleDevConsole={() => setPanelOpen((o) => !o)}
				/>
			)}

			<div className="flex flex-1 min-h-0 flex-row overflow-hidden">
				<SideNav
					online={online}
					devConsoleOpen={panelOpen}
					onToggleDevConsole={() => setPanelOpen((o) => !o)}
				/>

				<div
					className="flex-1 overflow-hidden pt-[52px] lg:pt-0 lg:m-[10px_10px_10px_0px] lg:rounded-2xl min-w-0"
					style={{
						paddingRight: panelOpen && !isMobile ? panelWidth : 0,
						transition: "padding-right 280ms cubic-bezier(0.4,0,0.2,1)",
					}}
				>
					{mounted && (
						<WindowManager isAuthed={!!isAuthed} />
					)}
				</div>
			</div>

			{mounted && <CommandPalette />}

			{mounted && isAuthed && (
				<DevConsole
					open={panelOpen}
					width={panelWidth}
					isMobile={isMobile}
					onClose={() => setPanelOpen(false)}
					onWidthChange={setPanelWidth}
					logs={logs}
					onClearLogs={() => setLogs([])}
				/>
			)}
		</div>
	);
}
