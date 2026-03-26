import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  // Change these to your desired username and password
  const USERNAME = process.env.DASHBOARD_USER;
  const PASSWORD = process.env.DASHBOARD_PASS;

  if (authHeader) {
    const auth = authHeader.split(' ')[1];
    const [user, pwd] = Buffer.from(auth, 'base64').toString().split(':');

    if (user === USERNAME && pwd === PASSWORD) {
      return NextResponse.next();
    }
  }

  // If not authenticated, trigger the browser's native login popup
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  });
}

// Only protect the dashboard, not the static assets
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
