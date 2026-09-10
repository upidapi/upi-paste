import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';

const server = new Server({
    // `path` needs to match the route declared by the next file router
    // ie /api/upload
    path: '/api/upload',
    datastore: new FileStore({ directory: './data' }),

    // onUploadCreate: async (req, upload) => {
    //     return {};
    // },
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
