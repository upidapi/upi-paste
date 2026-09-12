import { NextRequest } from 'next/server';
import { getPasteInfo } from '~/lib/files';
import fs from 'node:fs/promises';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const id = (await params).id;
    const sParams = req.nextUrl.searchParams;

    const pasteInfo = getPasteInfo({
        id,
        password: sParams.get('p'),
    });

    if (!pasteInfo.ok) return pasteInfo.res;

    const paste = pasteInfo.paste;
    
    // Once previewed, you can only download the file with the download token
    if (paste.previewedAt != -1 && paste.previewedAt < Date.now()) {
        return new Response('Paste not found', { status: 404 });
    }

    // bad to leek size/filename/filetype? (if its a one time burn)
    return Response.json({
        filename: paste.filename,
        filetype: paste.filetype,
        oneTime: paste.oneTime,
        expiry: paste.expiry,
        size: (await fs.stat(paste.filePath)).size,
    });
}
