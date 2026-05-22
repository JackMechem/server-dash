import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const token = req.cookies.get("token")?.value;
	if (!token) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { method, url, body } = (await req.json()) as {
		method: string;
		url: string;
		body?: unknown;
	};

	const targetUrl = url.startsWith("http")
		? url
		: `http://localhost:3001${url.startsWith("/") ? url : `/${url}`}`;

	const res = await fetch(targetUrl, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			...(body !== undefined ? { "Content-Type": "application/json" } : {}),
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	const text = await res.text();
	return new NextResponse(text, {
		status: res.status,
		headers: { "Content-Type": res.headers.get("Content-Type") ?? "text/plain" },
	});
}
