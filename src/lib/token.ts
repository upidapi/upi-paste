import crypto from 'crypto';

const SECRET_KEY = process.env.TOKEN_SECRET ?? 'your-secret-key';


export function generateId() {
    // TODO: implement
    return 'asdf';
}

// Generate a token for an ID
export function generateToken(id: string): string {
    return crypto
        .createHmac('sha256', SECRET_KEY)
        .update(id)
        .digest('hex');
}

// Verify if the token matches the ID
export function verifyToken(id: string, token: string): boolean {
    const expectedToken = generateToken(id);

    // Use timingSafeEqual to prevent timing attacks
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expectedToken);

    if (tokenBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}
