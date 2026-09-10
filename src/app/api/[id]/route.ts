import { createReadStream, createWriteStream, statSync } from 'fs';
import { unlink } from 'fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { getPasteInfo, initPaste } from '~/lib/files';
import { generateToken, verifyToken } from '~/lib/token';

// on put the [id] is the filename
export async function PUT(
    req: NextRequest,
    {
        params,
    }: {
        params: Promise<{
            id?: string; // not actually the id
        }>;
    },
) {
    const sParams = req.nextUrl.searchParams;
    const p = await params;
    const { id, filePath } = initPaste({
        isOneTime: sParams.has('one-time'),
        psw: sParams.get('psw') ?? '',
        filename: p.id, // (p.id ?? [])[0],
    });

    // stream the file to disk
    const fileWriteStream = createWriteStream(filePath);
    const nodeReadable = Readable.fromWeb(req.body as unknown as NodeReadableStream);
    await pipeline(nodeReadable, fileWriteStream);

    const URL = 'https://test.com';
    return new Response(`${URL}/${id}?t=${generateToken(id)}`, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
    });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id?: string }> }) {
    const sParams = req.nextUrl.searchParams;
    // const token = sParams.get('t');
    const id = (await params).id;

    if (id === undefined) return new Response('missing id', { status: 400 });

    const pasteInfo = getPasteInfo(id);
    if (!pasteInfo.exists) return new Response('', { status: 404 });

    const { filePath, fileName, psw, isOneTime } = pasteInfo;

    if (psw != (sParams.get('psw') ?? '')) {
        return new Response('wrong password', { status: 400 });
    }

    const stat = statSync(filePath);
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream);

    if (isOneTime) {
        nodeStream.on('close', () => {
            void (async () => {
                try {
                    await unlink(filePath);
                    await unlink(filePath + '.json');
                } catch (err) {
                    console.error('Failed to delete file', err);
                }
            })();
        });
    }

    return new NextResponse(webStream as ReadableStream, {
        status: 200,
        headers: {
            // 'Content-Type': 'video/mp4', // or 'application/octet-stream'
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': stat.size.toString(),
        },
    });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id?: string }> }) {
    const sParams = req.nextUrl.searchParams;
    const token = sParams.get('t');
    const id = (await params).id;

    if (id === undefined) return new Response('missing id', { status: 400 });

    const pasteInfo = getPasteInfo(id);
    if (!pasteInfo.exists) return new Response('', { status: 404 });

    const { filePath } = pasteInfo;

    if (verifyToken(id, token ?? '')) {
        return new Response('wrong token', { status: 400 });
    }

    try {
        await unlink(filePath);
        await unlink(filePath + '.json');
    } catch (err) {
        console.error('Failed to delete file', err);
    }

    return new NextResponse('', {
        status: 200,
    });
}
