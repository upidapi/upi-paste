import crypto from 'crypto';

const SECRET_KEY = process.env.TOKEN_SECRET ?? 'your-secret-key';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateRandomId(length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    let id = '';
    for (const b of bytes) {
        id += ALPHABET[b % ALPHABET.length];
    }
    return id;
}
export function createUniqueId(
    idExists: (id: string) => boolean, //
    startLength = 4,
    maxRetries = 3,
): string {
    let length = startLength;
    let retries = 0;

    while (true) {
        const id = generateRandomId(length);
        const exists = idExists(id);

        if (!exists) {
            return id;
        }

        retries++;
        if (retries >= maxRetries) {
            length++;
            retries = 0;
        }
    }
}

export function timingSafeEqual(a: string, b: string) {
    const tokenBuffer = Buffer.from(a);
    const expectedBuffer = Buffer.from(b);

    if (tokenBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

export function generateToken(id: string): string {
    return crypto.createHmac('sha256', SECRET_KEY).update(id).digest('hex').slice(0, 24);
}

export function verifyToken(id: string, token: string): boolean {
    const expectedToken = generateToken(id);

    return timingSafeEqual(token, expectedToken)
}
