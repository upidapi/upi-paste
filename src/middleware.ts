import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
    const userAgent = req.headers.get('user-agent')?.toLowerCase() || '';
    const accept = req.headers.get('accept')?.toLowerCase() || '';

    const cliTools = ['curl', 'wget', 'httpie', 'fetch'];
    const isCliAgent = cliTools.some((tool) => userAgent.includes(tool));
    // const isGet = req.method === 'GET';
    const wantsHtml = accept.includes('text/html');

    // If the user wants HTML or is using curl, let it load the standard page.tsx
    // if (isGet && ((isCliAgent && wantsHtml) || !isCliAgent)) {
    if ((isCliAgent && wantsHtml) || !isCliAgent) {
        return NextResponse.next();
    }

    // Otherwise, rewrite to an API route (e.g. /posts/123 -> /api/posts/123)
    const pathname = req.nextUrl.pathname;
    return NextResponse.rewrite(new URL(`/api${pathname}`, req.url));
}

// Apply to all pages except internal Next.js assets & static files
export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
