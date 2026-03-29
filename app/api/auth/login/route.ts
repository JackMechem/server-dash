import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const { username, password, totp } = await req.json();

	const res = await fetch("http://localhost:3001/auth/login", {
		method: "POST",
		headers: {
			Authorization:
				"Basic " +
				Buffer.from(`${username}:${password}${totp}`).toString("base64"),
		},
	});

	if (!res.ok) {
		return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
	}

	const { token } = await res.json();
	const response = NextResponse.json({ success: true });
	response.cookies.set("token", token, {
		httpOnly: true,
		secure: true,
		sameSite: "strict",
		maxAge: 60 * 60 * 8,
		path: "/",
	});
	return response;
}
