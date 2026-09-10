function formatValue(val: number): number {
    if (val >= 100) return Number(val.toFixed(0));
    if (val >= 10) return Number(val.toFixed(1));
    return Number(val.toFixed(2));
}

export function formatSize(bytes: number) {
    const prefixes = ['b', 'Kb', 'Mb', 'Gb', 'Tb'];
    for (const prefix of prefixes) {
        if (bytes < 1024) return `${formatValue(bytes)} ${prefix}`;
        bytes /= 1024;
    }
}


// import { type ClassValue, clsx } from 'clsx';
// import { twMerge } from 'tailwind-merge';
//
// export function cn(...inputs: ClassValue[]) {
//     return twMerge(clsx(inputs));
// }

export interface SingleFile {
    name: string;
    content: string;
    isText: boolean;
    isBinary: boolean;
    isTruncated?: boolean;
    blob?: Blob;
    size: number;
}

export interface PasteData {
    id: string;
    file: SingleFile;
    title: string;
    expiry: string;
    burnAfterReading: boolean;
    expiresAt: number | null;
}

export const MAX_SAFE_EDIT_BYTES = 1 * 1024 * 1024; // 1 MB safe limit for textarea
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;   // 10 MB limit
export const MAX_LINES = 10_000;

export const EXPIRY_OPTIONS = {
    never: -1,
    '5 mins': 5 * 60,
    '10 mins': 10 * 60,
    '30 mins': 30 * 60,
    '1 hour': 60 * 60,
    '1 day': 24 * 60 * 60,
    '1 week': 7 * 24 * 60 * 60,
    '1 month': 30 * 24 * 60 * 60,
    '1 year': 365 * 24 * 60 * 60,
};

// Fast in-place line counter
export function countLines(str: string): number {
    if (!str) return 1;
    let count = 1;
    for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) === 10) count++;
    }
    return count;
}

// Inspects up to the first 1 MB for null bytes or excessive control characters
export async function isBinaryFile(blob: Blob): Promise<boolean> {
    const slice = blob.slice(0, 1024 * 1024);
    const buffer = new Uint8Array(await slice.arrayBuffer());

    let bogusControlChars = 0;
    for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i]!;
        if (byte === 0) return true; // 0x00 is immediate binary indicator
        if (byte < 7 || (byte > 14 && byte < 32)) {
            bogusControlChars++;
        }
    }
    return buffer.length > 0 && bogusControlChars / buffer.length > 0.05;
}

// High-performance stream reader for previewing the first 1 MB
export async function readFirstMB(blob: Blob, maxBytes = 1024 * 1024): Promise<string> {
    const stream = blob.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let text = '';
    let bytesRead = 0;

    try {
        while (bytesRead < maxBytes) {
            const { done, value } = await reader.read();
            if (done || !value) break;

            if (bytesRead + value.length > maxBytes) {
                const needed = maxBytes - bytesRead;
                text += decoder.decode(value.subarray(0, needed), { stream: false });
                break;
            } else {
                text += decoder.decode(value, { stream: true });
                bytesRead += value.length;
            }
        }
    } finally {
        await reader.cancel();
    }
    return text;
}

// Formats expiry time remaining matching Wastebin styling
export function formatRemainingTime(expiresAt: number | null, burnAfterReading?: boolean): string {
    if (burnAfterReading) return 'burns after reading';
    if (!expiresAt) return 'never expires';

    const diff = Math.max(0, expiresAt - Date.now());
    const totalSecs = Math.floor(diff / 1000);

    const weeks = Math.floor(totalSecs / (7 * 24 * 3600));
    const days = Math.floor((totalSecs % (7 * 24 * 3600)) / (24 * 3600));
    const hours = Math.floor((totalSecs % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;

    const parts: string[] = [];
    if (weeks > 0) parts.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec${seconds > 1 ? 's' : ''}`);

    return `expires in ${parts.join(', ')}`;
}
