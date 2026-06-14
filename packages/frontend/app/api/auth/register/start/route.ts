import { NextRequest, NextResponse } from "next/server";
import { isEnrollmentOpen } from "@/lib/server-config";

export async function POST(req: NextRequest) {
	if (!isEnrollmentOpen()) {
		return new NextResponse(null, { status: 404 });
	}
	const { username, password } = await req.json();

	const res = await fetch("http://localhost:3001/auth/register/start", {
		method: "POST",
		headers: {
			Authorization:
				"Basic " +
				Buffer.from(`${username}:${password}`).toString("base64"),
		},
	});

	if (!res.ok) {
		return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
	}

	return NextResponse.json(await res.json());
}
