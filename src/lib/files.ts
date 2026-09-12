import { readFileSync, writeFileSync } from 'fs';
import { createUniqueId, timingSafeEqual } from './token';
import fs, { existsSync } from 'node:fs';
import path from 'node:path';
import * as z from 'zod';
import { open, readFile, writeFile } from 'node:fs/promises';
// import fs from 'node:fs/promises';

// import { readdir } from 'fs/promises';

// export function getUploadPath(id: string) {
//     return {filePath, metaPath};
// }

// const files = (await readdir(path.join(process.cwd(), "data"))).filter(x => x.endsWith(".json"))

export const PasteMetadataSchema = z.object({
    filename: z.string(),
    filetype: z.string(),
    expiry: z.number(),
    oneTime: z.boolean(),
    password: z.string(),

    // previewToken: z.string().default(''),
    previewedAt: z.number().default(-1),
    burnedAt: z.number().default(-1),
});
export type PasteMetadata = z.infer<typeof PasteMetadataSchema>;

const usedIds = new Set<string>(['admin']);
const dirPath = path.join(process.cwd(), 'data', 'paste');
if (fs.existsSync(dirPath)) {
    const folders = fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory() && !dirent.name.endsWith('.json'))
        .map((dirent) => dirent.name);

    for (const id of folders) {
        usedIds.add(id);
    }
}

export function initPaste(params: z.input<typeof PasteMetadataSchema>) {
    const id = createUniqueId((id) => usedIds.has(id));
    usedIds.add(id);

    const filePath = path.join(process.cwd(), 'data/paste', id);
    const metaPath = filePath + '.json';

    const timeStr = new Date().toISOString().replace('T', '_').slice(0, 19);

    // save metadata
    writeFileSync(
        metaPath,
        JSON.stringify({
            ...params,
            filename: params.filename ?? `unamed-${timeStr}.txt`,
            filetype: params.filetype ?? 'application/octet-stream',
        }),
    );

    return { id, filePath };
}

export async function updateMetadata(id: string, metadata: Partial<PasteMetadata>) {
    const metaPath = path.join(process.cwd(), 'data', id) + '.json';

    const res = (await readFile(metaPath)).toString();
    const meta = JSON.parse(res) as unknown as PasteMetadata;

    await writeFile(metaPath, JSON.stringify({ ...meta, ...metadata }));
}

// export function delPaste(id: string) {
//     void (async () => {
//         try {
//             await unlink(paste.filePath);
//             await unlink(paste.filePath + '.json');
//         } catch (err) {
//             console.error('Failed to delete file', err);
//         }
//     })();
// }

// TODO: burn paste 5m after preview

export function getPasteInfo({ id, password }: { id: string; password?: string | null }) {
    const filePath = path.join(process.cwd(), 'data', id);
    const metaPath = filePath + '.json';

    if (!existsSync(metaPath))
        return {
            ok: false as const,
            res: new Response('Paste not found', { status: 404 }),
        };

    const res = readFileSync(metaPath).toString();
    const meta = JSON.parse(res) as unknown as PasteMetadata;

    if (meta.burnedAt != -1 && meta.burnedAt < Date.now())
        return {
            ok: false as const,
            res: new Response('Paste not found', { status: 404 }),
        };

    if (meta.expiry != -1 && meta.expiry < Date.now())
        return {
            ok: false as const,
            res: new Response('Paste not found', { status: 404 }),
        };

    if (!timingSafeEqual(meta.password, password ?? '')) {
        if (typeof password != 'string')
            return {
                ok: false as const,
                res: new Response('Password required', { status: 401 }),
            };

        return {
            ok: false as const,
            res: new Response('Wrong password', { status: 403 }),
        };
    }

    return {
        ok: true as const,
        paste: {
            filePath,
            id,
            ...meta,
        },
    };
}

export async function readFirstBytes(filePath: string, nBytes: number) {
    const fileHandle = await open(filePath, 'r');

    try {
        const buffer = Buffer.alloc(nBytes);
        const { bytesRead } = await fileHandle.read(buffer, 0, nBytes, 0);

        return buffer.subarray(0, bytesRead);
    } finally {
        await fileHandle.close();
    }
}
