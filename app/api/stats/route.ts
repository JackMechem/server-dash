import { NextResponse } from 'next/server';

export async function GET() {
    const res = await fetch('http://localhost:3001/stats');
    const data = await res.json();
    return NextResponse.json(data);
}
