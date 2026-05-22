import { NextResponse } from "next/server";

export async function GET() {
	const res = await fetch("http://localhost:3001/power");

	if (!res.ok) {
		return NextResponse.json({ error: "Upstream error" }, { status: res.status });
	}

	return NextResponse.json(await res.json());
}
