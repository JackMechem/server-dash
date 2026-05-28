import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const backendRes = await fetch(`http://localhost:3001/smart-buttons/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    if (!backendRes.ok) {
        return NextResponse.json({ error: "backend error" }, { status: backendRes.status });
    }

    // Also push rename to the device itself so it survives reboots
    try {
        const devRes = await fetch(`http://localhost:3001/smart-buttons`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (devRes.ok) {
            const devices = await devRes.json();
            const device = devices.find((d: { device_id: string; ip: string }) => d.device_id === id);
            if (device?.ip) {
                await fetch(`http://${device.ip}/api/rename`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(4000),
                }).catch(() => {}); // non-fatal if device unreachable
            }
        }
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true });
}
