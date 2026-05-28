import { NextRequest, NextResponse } from "next/server";

const BACKEND = "http://localhost:3001";

function token(req: NextRequest) {
    return req.cookies.get("token")?.value;
}

export async function GET(req: NextRequest) {
    const t = token(req);
    if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const res = await fetch(`${BACKEND}/automations`, {
        headers: { Authorization: `Bearer ${t}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
    const t = token(req);
    if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const res = await fetch(`${BACKEND}/automations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    return NextResponse.json(data, { status: res.status });
}
