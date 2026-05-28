export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
	const token = req.cookies.get("token")?.value;
	if (!token) return new Response("Unauthorized", { status: 401 });

	const upstream = await fetch("http://localhost:3001/smart-buttons/stream", {
		headers: {
			Accept: "text/event-stream",
			"Cache-Control": "no-cache",
			Authorization: `Bearer ${token}`,
		},
	}).catch(() => null);

	if (!upstream?.ok || !upstream.body) {
		return new Response("upstream unavailable", { status: 502 });
	}

	return new Response(upstream.body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
