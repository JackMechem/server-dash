import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = await params;

	const res = await fetch(`http://localhost:3001/smart-buttons/${id}`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${token}` },
	});
	const data = await res.json();
	return NextResponse.json(data, { status: res.status });
}
