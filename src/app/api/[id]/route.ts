import { createReadStream, createWriteStream, statSync } from 'fs';
import { unlink } from 'fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { getPasteInfo, initPaste, updateMetadata } from '~/lib/files';
import { generateToken, timingSafeEqual, verifyToken } from '~/lib/token';

// TODO:
// on put the [id] is the filename
// export async function PUT(
//     req: NextRequest,
//     {
//         params,
//     }: {
//         params: Promise<{
//             id?: string; // not actually the id
//         }>;
//     },
// ) {
//     const sParams = req.nextUrl.searchParams;
//     const p = await params;
//
//     if (!p.id) {
//         return new Response('Missing id', { status: 400 });
//     }
//
//     const { id, filePath } = initPaste({
//         oneTime: sParams.has('one-time'),
//         password: sParams.get('psw') ?? '',
//         filename: p.id, // (p.id ?? [])[0],
//     });
//
//     // stream the file to disk
//     const fileWriteStream = createWriteStream(filePath);
//     const nodeReadable = Readable.fromWeb(req.body as unknown as NodeReadableStream);
//     await pipeline(nodeReadable, fileWriteStream);
//
//     const URL = 'https://test.com';
//     return new Response(`${URL}/${id}?t=${generateToken("owner", id)}`, {
//         status: 200,
//         headers: {
//             'Content-Type': 'text/plain; charset=utf-8',
//         },
//     });
// }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const id = (await params).id;
    const sParams = req.nextUrl.searchParams;

    if (id === undefined) return new Response('Missing id', { status: 400 });

    const pasteInfo = getPasteInfo({
        id,
        password: sParams.get('p'),
    });

    if (!pasteInfo.ok) return pasteInfo.res;

    const paste = pasteInfo.paste;

    // if user has previewed, then force them to provide the token
    if (paste.previewedAt != -1) {
        const previewToken = sParams.get('h');
        if (previewToken == null) {
            return new Response('Missing preview token', { status: 403 });
        }
        if (!verifyToken('preview', paste.id, previewToken)) {
            return new Response('Wrong preview token', { status: 403 });
        }
    }

    const stat = statSync(paste.filePath);
    const nodeStream = createReadStream(paste.filePath);
    const webStream = Readable.toWeb(nodeStream);

    if (paste.oneTime) {
        await updateMetadata(paste.id, {
            burnedAt: Date.now(),
        });
    }

    return new NextResponse(webStream as ReadableStream, {
        status: 200,
        headers: {
            'Content-Type': paste.filetype,
            'Content-Disposition': `attachment; filename="${paste.filename}"`,
            'Content-Length': stat.size.toString(),
        },
    });
}

// TODO:
// export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id?: string }> }) {
//     const sParams = req.nextUrl.searchParams;
//     const token = sParams.get('t');
//     const id = (await params).id;
//
//     if (id === undefined) return new Response('missing id', { status: 400 });
//
//     const pasteInfo = getPasteInfo(id);
//     if (!pasteInfo.exists) return new Response('', { status: 404 });
//
//     const { filePath } = pasteInfo;
//
//     if (verifyToken(id, token ?? '')) {
//         return new Response('wrong token', { status: 400 });
//     }
//
//     try {
//         await unlink(filePath);
//         await unlink(filePath + '.json');
//     } catch (err) {
//         console.error('Failed to delete file', err);
//     }
//
//     return new NextResponse('', {
//         status: 200,
//     });
// }
