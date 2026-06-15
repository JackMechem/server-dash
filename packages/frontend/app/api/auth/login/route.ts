import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const { username, password, bypass_2fa } = await req.json();

	const url = bypass_2fa
		? "http://localhost:3001/auth/login?bypass_2fa=1"
		: "http://localhost:3001/auth/login";

	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization:
				"Basic " +
				Buffer.from(`${username}:${password}`).toString("base64"),
		},
	});

	if (!res.ok) {
		const text = await res.text();
		return NextResponse.json({ error: text }, { status: 401 });
	}

	const data = await res.json();

	// No 2FA registered — token is returned directly, set cookie immediately
	if (data.token) {
		const response = NextResponse.json({ no_2fa: true });
		response.cookies.set("token", data.token, {
			httpOnly: true,
			sameSite: "strict",
			maxAge: 60 * 60 * 8,
			path: "/",
		});
		return response;
	}

	return NextResponse.json(data);
}
