import { NextRequest, NextResponse } from "next/server";
import { getDellservIp } from "@/lib/server-config";

// The ESP32 needs a real routable IP to POST state_change events back to.
// Set server.dellserv_ip in /etc/server-dash/config.toml to the server's LAN IP.
// Falls back to the IP the Next.js server uses to reach the ESP32.
async function getCallbackUrl(esp32Ip: string): Promise<string> {
	const envIp = getDellservIp();
	if (envIp) return `http://${envIp}:3001/smart-buttons/callback`;

	// Derive server LAN IP from the outbound interface used to reach the ESP32.
	// Node doesn't expose this directly, so we parse it from a UDP socket lookup.
	try {
		const { createSocket } = await import("dgram");
		const ip = await new Promise<string>((resolve, reject) => {
			const s = createSocket("udp4");
			s.connect(53, esp32Ip, () => {
				const addr = s.address().address;
				s.close();
				resolve(addr);
			});
			s.on("error", reject);
		});
		return `http://${ip}:3001/smart-buttons/callback`;
	} catch {
		return "http://localhost:3001/smart-buttons/callback";
	}
}

export async function POST(req: NextRequest) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { ip } = await req.json();
	if (!ip) return NextResponse.json({ error: "ip required" }, { status: 400 });

	// 1. Ping the device
	let info: { device_id: string; ip: string; type: string; registered: boolean; state?: unknown };
	try {
		const r = await fetch(`http://${ip}/api/info`, { signal: AbortSignal.timeout(5000) });
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		info = await r.json();
	} catch (e: unknown) {
		return NextResponse.json(
			{ error: `Cannot reach device: ${e instanceof Error ? e.message : String(e)}` },
			{ status: 502 },
		);
	}

	if (info.type !== "jmthing") {
		return NextResponse.json({ error: "Device is not a JMIoT device." }, { status: 400 });
	}

	// 2. Determine the callback URL the ESP32 will use for future pushes
	const callbackUrl = await getCallbackUrl(ip);

	// 3. Tell the ESP32 our callback URL — it will immediately fire a register push
	try {
		const r = await fetch(`http://${ip}/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ callback_url: callbackUrl }),
			signal: AbortSignal.timeout(8000),
		});
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	} catch (e: unknown) {
		return NextResponse.json(
			{ error: `Registration failed: ${e instanceof Error ? e.message : String(e)}` },
			{ status: 502 },
		);
	}

	// 4. Also push the register event directly to the Rust backend ourselves,
	//    so the device appears immediately even before the ESP32's async callback lands.
	try {
		await fetch("http://localhost:3001/smart-buttons/callback", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				type: "register",
				device_id: info.device_id,
				ip,
				state: [
					{ button: 1, enabled: false },
					{ button: 2, enabled: false },
				],
			}),
		});
	} catch {
		// Non-fatal: the ESP32's own callback will arrive shortly
	}

	return NextResponse.json({ ok: true, device_id: info.device_id });
}
