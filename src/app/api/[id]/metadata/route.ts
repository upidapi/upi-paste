import { NextRequest } from 'next/server';
import { getPasteInfo } from '~/lib/files';
import { timingSafeEqual } from '~/lib/token';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const id = (await params).id;
    const sParams = req.nextUrl.searchParams;
    const psw = sParams.get('p') ?? '';

    const paste = getPasteInfo(id);
    if (!paste.exists) {
        return new Response('Paste not found', { status: 404 });
    }

    if (paste.expiry != -1 && paste.expiry < Date.now()) {
        return new Response('Paste not found', { status: 404 });
    }

    if (!timingSafeEqual(paste.password, psw)) {
        return new Response('Wrong password', { status: 400 });
    }

    return {
        filename: paste.filename, 
        filetype: paste.filetype, 
        oneTime: paste.oneTime, 
    }
}
