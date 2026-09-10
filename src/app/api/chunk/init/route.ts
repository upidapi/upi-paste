import type { NextRequest } from 'next/server';
import { initPaste } from '~/lib/files';

export async function PUT(req: NextRequest) {
    const sParams = req.nextUrl.searchParams;
    const { id } = initPaste({
        isOneTime: sParams.has('one-time'),
        psw: sParams.get('psw') ?? '',
        filename: sParams.get('filename') ?? undefined, // (p.id ?? [])[0],
    });

    const size = sParams.get("size");

    // // stream the file to disk
    // const fileWriteStream = createWriteStream(filePath);
    // // @ts-expect-error
    // const nodeReadable = Readable.fromWeb(req.body);
    // await pipeline(nodeReadable, fileWriteStream);

    return new Response(id, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
    });
}
