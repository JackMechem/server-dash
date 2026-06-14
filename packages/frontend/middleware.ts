import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;

	// Always allow login, auth, and enrollment routes.
	// Enrollment gating is enforced by the API routes (which read /etc/server-dash/config.toml),
	// not here — middleware runs in the Edge runtime and cannot read the filesystem.
	if (
		pathname.startsWith("/auth") ||
		pathname.startsWith("/api/auth") ||
		pathname.startsWith("/enroll")
	) {
		return NextResponse.next();
	}

	// Public routes — accessible without auth
	if (
		pathname === "/" ||
		pathname === "/analytics" ||
		((pathname === "/api/power" || pathname === "/api/stats" || pathname === "/api/power/history") && req.method === "GET")
	) {
		return NextResponse.next();
	}

	// No token — redirect to login
	const token = req.cookies.get("token")?.value;
	if (!token) {
		const loginUrl = new URL("/auth", req.url);
		loginUrl.searchParams.set("callbackUrl", pathname);
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.ico).*)"],
};
