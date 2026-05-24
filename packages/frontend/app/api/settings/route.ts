import { NextRequest, NextResponse } from "next/server";

function authHeaders(req: NextRequest): Record<string, string> | null {
	const token = req.cookies.get("token")?.value;
	if (!token) return null;
	return { Authorization: `Bearer ${token}` };
}

export async function GET(req: NextRequest) {
	const headers = authHeaders(req);
	if (!headers) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const res = await fetch("http://localhost:3001/settings", { headers });
	if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: res.status });
	return NextResponse.json(await res.json());
}

export async function PUT(req: NextRequest) {
	const headers = authHeaders(req);
	if (!headers) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const body = await req.json();
	const res = await fetch("http://localhost:3001/settings", {
		method: "PUT",
		headers: { ...headers, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	const text = await res.text();
	if (!res.ok) return NextResponse.json({ error: text }, { status: res.status });
	return NextResponse.json(JSON.parse(text));
}
