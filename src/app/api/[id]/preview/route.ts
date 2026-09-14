import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { getPasteInfo, readFirstBytes, updateMetadata } from '~/lib/files';
import fs from 'node:fs/promises';
import { generateToken, verifyToken } from '~/lib/token';
import { MAX_SAFE_EDIT_BYTES } from '~/lib/const';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const id = (await params).id;
    const sParams = req.nextUrl.searchParams;

    const pasteInfo = getPasteInfo({
        id,
        password: sParams.get('psw'),
    });

    if (!pasteInfo.ok) return pasteInfo.res;

    const paste = pasteInfo.paste;

    if (paste.previewedAt != -1 && paste.previewedAt < Date.now()) {
        return new Response('Paste not found', { status: 404 });
    }

    // Once previewed, you can only download the file with the download token
    if (paste.oneTime) {
        await updateMetadata(paste.id, {
            previewedAt: Date.now(),
        });
    }

    return Response.json({
        preview: (await readFirstBytes(paste.filePath, MAX_SAFE_EDIT_BYTES)).toString('base64'),
        previewToken: generateToken('preview', id),
    });
}
