import { readFileSync, writeFileSync } from 'fs';
import { createUniqueId } from './token';
import fs from 'node:fs';
import path from 'node:path';
import * as z from 'zod';

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

export function initPaste(params: PasteMetadata) {
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

// export function delPaste() {
//     
// }

export function getPasteInfo(id: string) {
    const filePath = path.join(process.cwd(), 'data', id);
    const metaPath = filePath + '.json';

    try {
        const metadata = JSON.parse(readFileSync(metaPath).toString()) as unknown as PasteMetadata;
        return {
            exists: true as const,
            filePath,
            ...metadata,
        };
    } catch {
        return {
            exists: false as const,
        };
    }
}
