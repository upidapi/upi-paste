// app/[id]/page.tsx (or your dynamic route folder)

import { verifyToken } from '~/lib/token';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function idExists(id: string) {
    // TODO: implement
    return true;
}

function getFileInfo(id: string) {
    return {
        exists: true,
        fileName: 'file.txt',
        fileSize: 1000000, // in bytes
    };
}

function formatValue(val: number): number {
    if (val >= 100) return Number(val.toFixed(0));
    if (val >= 10) return Number(val.toFixed(1));
    return Number(val.toFixed(2));
}

function formatSize(bytes: number) {
    const prefixes = ['Kb', 'Mb', 'Gb', 'Tb'];
    for (const prefix of prefixes) {
        if (bytes < 1024) return `${formatValue(bytes)} ${prefix}`;
        bytes /= 1024;
    }
}

export default async function Page(props: PageProps) {
    const id = (await props.params).id;
    const searchParams = await props.searchParams;

    const t = searchParams.t;
    const token = Array.isArray(t) ? t[0] : (t ?? '');

    const { exists, fileName, fileSize } = getFileInfo(id!);
    if (!exists) {
        return (
            <div>
                <span>File not found</span>
            </div>
        );
    }

    const validToken = token && verifyToken(id, token);
    const invalidToken = token && !verifyToken(id, token);

    const handleDownload = () => {
        if (!validToken) {
            alert('invalid token');
        } else {
            window.location.href = `/api/${encodeURIComponent(token)}`;
        }
    };

    return (
        <div>
            <h1>
                {fileName}: {formatSize(fileSize)}
            </h1>
            <p>{validToken ? 'You own this' : 'You dont own this'}</p>
            {invalidToken && <p>invalid token</p>}
            <button
        </div>
    );
}
