import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
// import { EXPIRY_OPTIONS } from '~/lib/const';
import { generateToken } from '~/lib/token';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initPaste, PasteMetadataSchema } from '~/lib/files';
import { URL } from '~/lib/const';

const server = new Server({
    // `path` needs to match the route declared by the next file router
    // ie /api/upload
    path: `${URL}/api/upload`,
    datastore: new FileStore({ directory: './data/tmp' }),

    onUploadCreate: async (_req, upload) => {
        // console.log(req, upload);
        try {
            PasteMetadataSchema.parse(
                JSON.parse(upload.metadata!.json!), //
            );
            return {};
        } catch (e) {
            console.error('Validation error in onUploadCreate:', e);
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw { status_code: 400 };
        }
    },

    onUploadFinish: async (_req, upload) => {
        // console.log(req, upload);

        const { id, filePath } = initPaste(
            PasteMetadataSchema.parse(
                JSON.parse(upload.metadata!.json!), //
            ),
        );
        
        const tPath = path.join('data/tmp', upload.id);

        await fs.rm(tPath + '.json');
        await fs.rename(tPath, filePath);

        return {
            status_code: 204, // standard tus status
            headers: {
                'Access-Control-Expose-Headers': 'X-Paste-Id, X-Paste-Token',
                'X-Paste-Id': id,
                'X-Paste-Token': generateToken("owner", id),
            },
        };
        // return {
        //     status_code: 200,
        //     headers: {
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify({
        //         id,
        //         token: generateToken(id),
        //     }),
        // };
    },
});

// required to not strip the "this"
// can also use server.handleWeb.bind(server);
function handle(req: Request) {
    return server.handleWeb(req);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
