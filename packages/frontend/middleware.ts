import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ENROLLMENT_OPEN = process.env.ENROLLMENT_OPEN === "true";

export function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;

	// Enrollment routes — only accessible when enrollment is open
	if (
		pathname.startsWith("/enroll") ||
		pathname.startsWith("/api/auth/register")
	) {
		return ENROLLMENT_OPEN
			? NextResponse.next()
			: new NextResponse(null, { status: 404 });
	}

	// Always allow login page and auth api routes
	if (pathname.startsWith("/auth") || pathname.startsWith("/api/auth")) {
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
