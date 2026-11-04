export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { DATA_DIR } = await import('~/lib/const-server');

        const fs = await import('node:fs/promises');

        await fs.mkdir(`${DATA_DIR}/tmp`, { recursive: true });
        await fs.mkdir(`${DATA_DIR}/paste`, { recursive: true });
    }
}
