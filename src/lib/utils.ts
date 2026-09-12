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

export function countLines(str: string): number {
    if (!str) return 1;
    let count = 1;
    for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) === 10) count++;
    }
    return count;
}

export function isProbBinary(buffer: Uint8Array): boolean {
    if (buffer.length === 0) return false;

    let bogusControlChars = 0;

    for (const byte of buffer) {
        if (byte === 0) return true;
        // Check bogus control chars (skips \t=9, \n=10, \r=13, and ANSI \x1b=27)
        if ((byte < 7 || (byte > 14 && byte < 32)) && byte !== 27) {
            bogusControlChars++;
        }
    }
    return bogusControlChars / buffer.length > 0.05;
}
