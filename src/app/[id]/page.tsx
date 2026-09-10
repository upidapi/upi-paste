// app/[id]/page.tsx (or your dynamic route folder)

// import { verifyToken } from '~/lib/token';
//
// interface PageProps {
//     params: Promise<{ id: string }>;
//     searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
// }
//
// function idExists(id: string) {
//     // TODO: implement
//     return true;
// }
//
// function getFileInfo(id: string) {
//     return {
//         exists: true,
//         fileName: 'file.txt',
//         fileSize: 1000000, // in bytes
//     };
// }
//
// export default async function Page(props: PageProps) {
//     const id = (await props.params).id;
//     const searchParams = await props.searchParams;
//
//     const t = searchParams.t;
//     const token = Array.isArray(t) ? t[0] : (t ?? '');
//
//     const { exists, fileName, fileSize } = getFileInfo(id!);
//     if (!exists) {
//         return (
//             <div>
//                 <span>File not found</span>
//             </div>
//         );
//     }
//
//     const validToken = token && verifyToken(id, token);
//     const invalidToken = token && !verifyToken(id, token);
//
//     const handleDownload = () => {
//         if (!validToken) {
//             alert('invalid token');
//         } else {
//             window.location.href = `/api/${encodeURIComponent(token)}`;
//         }
//     };
//
//     return (
//         <div>
//             <h1>
//                 {fileName}: {formatSize(fileSize)}
//             </h1>
//             <p>{validToken ? 'You own this' : 'You dont own this'}</p>
//             {invalidToken && <p>invalid token</p>}
//             <button
//         </div>
//     );
// }
//



'use client';

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Trash2, Download, Copy, Check } from 'lucide-react';
import TopBar from '~/_components/top-bar';
import PasteViewer from '~/_components/paste-viewer';

export default function PastePage() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;

    const [copied, setCopied] = useState(false);

    // Initial paste data state
    const [paste, setPaste] = useState({
        id: id || 'test-paste',
        name: 'asdfasdfjksafdjkl;fasdkj',
        content: 'asdfasdfjksafdjkl;fasdkj\n',
        isBinary: false,
        isTruncated: false,
        size: 26,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 29 + 1000 * 60 * 60 * 23 + 1000 * 60 * 59 + 59000),
    });

    const handleCopy = async () => {
        if (!paste.content) return;
        await navigator.clipboard.writeText(paste.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([paste.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = paste.name || `${paste.id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this paste?')) return;
        try {
            await fetch(`/api/${paste.id}`, { method: 'DELETE' });
        } catch {
            // Callback stub
        }
        router.push('/');
    };

    const handleViewAnyway = () => {
        setPaste((prev) => ({ ...prev, isBinary: false }));
    };

    return (
        <div className="flex flex-col h-screen w-screen bg-[#0b0e14] text-[#b8bfc9] font-mono select-none overflow-hidden text-sm">
            <TopBar showExpiry={Boolean(paste.expiresAt)} expiresAt={paste.expiresAt}>
                <button
                    type="button"
                    onClick={handleDelete}
                    title="Delete"
                    className="p-1.5 text-[#8b949e] hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                >
                    <Trash2 size={16} />
                </button>
                <button
                    type="button"
                    onClick={handleDownload}
                    title="Download"
                    className="p-1.5 text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#1b212b]/60 rounded transition-colors"
                >
                    <Download size={16} />
                </button>
                <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy to clipboard"
                    className="p-1.5 text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#1b212b]/60 rounded transition-colors"
                >
                    {copied ? <Check size={16} className="text-cyan-400" /> : <Copy size={16} />}
                </button>
            </TopBar>

            <div className="flex-1 flex flex-col overflow-hidden">
                <PasteViewer
                    value={paste.content}
                    fileName={paste.name}
                    isBinary={paste.isBinary}
                    isTruncated={paste.isTruncated}
                    totalSize={paste.size}
                    mode="view"
                    onRevealAnyway={handleViewAnyway}
                />
            </div>
        </div>
    );
}
