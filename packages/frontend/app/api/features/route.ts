import { NextResponse } from "next/server";
import { isTapoEnabled } from "@/lib/server-config";

export async function GET() {
	return NextResponse.json({ tapo: isTapoEnabled() });
}
