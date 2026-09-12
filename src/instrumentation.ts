export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const fs = await import('node:fs/promises');

        await fs.mkdir('data/tmp', { recursive: true });
        await fs.mkdir('data/paste', { recursive: true });
    }
}
