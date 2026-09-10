import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';

const server = new Server({
    // `path` needs to match the route declared by the next file router
    // ie /api/upload
    path: '/api/upload',
    datastore: new FileStore({ directory: './files' }),

    onUploadCreate: async (req, upload) => {
        return {};
    },
});

export const GET = server.handleWeb;
export const POST = server.handleWeb;
export const PATCH = server.handleWeb;
export const DELETE = server.handleWeb;
export const OPTIONS = server.handleWeb;
export const HEAD = server.handleWeb;
