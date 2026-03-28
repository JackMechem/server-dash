import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
	const token = req.cookies.get("token")?.value;
	const { pathname } = req.nextUrl;

	// always allow login page and auth api routes
	if (pathname.startsWith("/auth") || pathname.startsWith("/api/auth")) {
		return NextResponse.next();
	}

	// no token — redirect to login
	if (!token) {
		const loginUrl = new URL("/auth", req.url);
		loginUrl.searchParams.set("callbackUrl", pathname);
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
