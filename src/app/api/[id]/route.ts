import { createReadStream, createWriteStream, statSync } from 'fs';
import { NextResponse, type NextRequest } from 'next/server';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { URL } from '~/lib/const';
import { getPasteInfo, initPaste, updateMetadata } from '~/lib/files';
import { generateToken, verifyToken } from '~/lib/token';

// TODO:
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
    const filename = (await params).id;
    const sParams = req.nextUrl.searchParams;

    const rExpiry = sParams.get('expiry') ?? '7d';
    const expiry = /^[-\d]+$/.test(rExpiry)
        ? parseInt(rExpiry)
        : Date.now() +
          parseInt(rExpiry.slice(0, -1)) *
              {
                  s: 1000,
                  m: 1000 * 60,
                  h: 1000 * 60 * 60,
                  d: 1000 * 60 * 60 * 24,
                  w: 1000 * 60 * 60 * 24 * 7,
                  M: 1000 * 60 * 60 * 24 * 30,
                  y: 1000 * 60 * 60 * 24 * 365,
              }[rExpiry.at(-1)!]!;

    const { id, filePath } = initPaste({
        filename: filename ?? '',
        filetype: '',
        expiry,
        oneTime: sParams.has('one-time'),
        password: sParams.get('psw') ?? '',
    });

    // stream the file to disk
    const fileWriteStream = createWriteStream(filePath);
    const nodeReadable = Readable.fromWeb(req.body as unknown as NodeReadableStream);
    await pipeline(nodeReadable, fileWriteStream);

    return new Response(`${URL}/${id}?t=${generateToken('owner', id)}`, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
    });
}

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
            deletedAt: Date.now(),
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id?: string }> }) {
    const id = (await params).id;
    const sParams = req.nextUrl.searchParams;

    const password = sParams.get('p');
    const ownerToken = sParams.get('t');

    if (id === undefined) return new Response('Missing id', { status: 400 });

    const pasteInfo = getPasteInfo({ id, password });

    if (!pasteInfo.ok) return pasteInfo.res;

    const paste = pasteInfo.paste;

    if (ownerToken == null) {
        return new Response('Missing owner token', { status: 403 });
    }
    if (!verifyToken('owner', paste.id, ownerToken)) {
        return new Response('Wrong owner token', { status: 403 });
    }

    await updateMetadata(id, { deletedAt: Date.now() });

    return new NextResponse('', {
        status: 200,
    });
}
