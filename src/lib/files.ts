import { readFileSync, writeFileSync } from 'fs';
import { generateId } from './token';
import path from 'path';
// import { readdir } from 'fs/promises';

// export function getUploadPath(id: string) {
//     return {filePath, metaPath};
// }

// const files = (await readdir(path.join(process.cwd(), "data"))).filter(x => x.endsWith(".json"))

type PasteMetadata = {
    isOneTime: boolean;
    psw: string;
    fileName: string;
};

export function initPaste(params: { isOneTime: boolean; psw: string; filename?: string }) {
    const id = generateId();

    const filePath = path.join(process.cwd(), 'data', id);
    const metaPath = filePath + '.json';

    const timeStr = new Date().toISOString().replace('T', '_').slice(0, 19);
    const filename = params.filename ?? `unamed-${timeStr}.txt`;

    // save metadata
    writeFileSync(
        metaPath,
        JSON.stringify({
            isOneTime: params.isOneTime,
            psw: params.psw,
            filename,
        }),
    );

    return { id, filePath };
}

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
