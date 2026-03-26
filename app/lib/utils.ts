export function formatBytes(bytes: number): string {
	if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + " GB";
	if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + " MB";
	return (bytes / 1e3).toFixed(1) + " KB";
}

export function statColor(percent: number): string {
	if (percent > 80) return "#ef4444";
	if (percent > 60) return "#f59e0b";
	return "#3b82f6";
}

export function pad(n: number): string {
	return String(n).padStart(2, "0");
}
