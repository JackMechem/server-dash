export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
	const upstream = await fetch("http://localhost:3001/power/stream", {
		headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
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
