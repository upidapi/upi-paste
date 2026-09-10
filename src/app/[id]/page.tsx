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

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { TopBar } from '~/_components/top-bar';
import { PasteViewer } from '~/_components/paste-viewer';
import {
    type PasteData,
    readFirstMB,
    formatRemainingTime,
} from '~/lib/utils';

export default function PasteViewPage() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;

    const [paste, setPaste] = useState<PasteData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [showQrModal, setShowQrModal] = useState(false);

    // Fetch or initialize paste data
    useEffect(() => {
        async function loadPaste() {
            try {
                const res = await fetch(`/api/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setPaste(data);
                } else {
                    // Fallback demo paste representation if viewing directly
                    setPaste({
                        id,
                        title: 'example-paste.txt',
                        expiry: '1 month',
                        burnAfterReading: false,
                        expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
                        file: {
                            name: 'example-paste.txt',
                            content: 'asdfasdfjksafdjkl;fasdkj',
                            isText: true,
                            isBinary: false,
                            size: 25,
                        },
                    });
                }
            } catch {
                setPaste({
                    id,
                    title: 'example-paste.txt',
                    expiry: '1 month',
                    burnAfterReading: false,
                    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
                    file: {
                        name: 'example-paste.txt',
                        content: 'asdfasdfjksafdjkl;fasdkj',
                        isText: true,
                        isBinary: false,
                        size: 25,
                    },
                });
            } finally {
                setIsLoading(false);
            }
        }

        if (id) loadPaste();
    }, [id]);

    const handleHome = () => {
        router.push('/');
    };

    const handleDelete = async () => {
        if (!paste) return;
        if (window.confirm(`Are you sure you want to delete "${paste.title || paste.file.name}"?`)) {
            setIsProcessing(true);
            setStatusMessage('Deleting paste...');
            try {
                await fetch(`/api/${id}`, { method: 'DELETE' });
            } finally {
                setIsProcessing(false);
                router.push('/');
            }
        }
    };

    const handleDownload = () => {
        if (!paste) return;
        const blob =
            paste.file.blob ||
            new Blob([paste.file.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = paste.file.name || 'paste.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleCopy = async () => {
        if (!paste) return;
        try {
            await navigator.clipboard.writeText(paste.file.content);
        } catch {
            const el = document.createElement('textarea');
            el.value = paste.file.content;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        }
    };

    const handleRaw = () => {
        if (!paste) return;
        const blob = new Blob([paste.file.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    };

    // "View anyway" handler for binary and large files
    const handleViewAnyway = async () => {
        if (!paste?.file.blob) return;
        setIsProcessing(true);
        setStatusMessage('Reading text preview...');
        try {
            const text = await readFirstMB(paste.file.blob);
            const isTruncated = paste.file.blob.size > 1024 * 1024;
            setPaste((prev) =>
                prev
                    ? {
                          ...prev,
                          file: {
                              ...prev.file,
                              content: text,
                              isTruncated,
                              isText: true,
                          },
                      }
                    : null
            );
        } catch {
            alert('Failed to read file preview.');
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-screen w-screen bg-[#0e1116] items-center justify-center">
                <Loader2 className="animate-spin text-cyan-400" size={32} />
            </div>
        );
    }

    if (!paste) {
        return (
            <div className="flex flex-col h-screen w-screen bg-[#0e1116] text-[#c9d1d9] items-center justify-center gap-4 font-mono">
                <p>Paste not found or has expired.</p>
                <button
                    onClick={handleHome}
                    className="px-4 py-2 border border-[#30363d] text-cyan-400 hover:border-cyan-400 text-xs"
                >
                    Create a new paste
                </button>
            </div>
        );
    }

    const expiryText = formatRemainingTime(paste.expiresAt, paste.burnAfterReading);

    return (
        <div className="flex flex-col h-screen w-screen bg-[#0e1116] text-[#b8bfc9] font-mono select-none overflow-hidden text-sm relative">
            {isProcessing && (
                <div className="absolute inset-0 z-50 bg-black/75 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
                    <Loader2 className="animate-spin text-cyan-400" size={32} />
                    <p className="text-cyan-300 text-xs tracking-wider">{statusMessage}</p>
                </div>
            )}

            {/* QR Code Modal */}
            {showQrModal && (
                <div className="absolute inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#0e1116] border border-[#1b212b] p-6 max-w-xs w-full text-center relative flex flex-col items-center">
                        <button
                            type="button"
                            onClick={() => setShowQrModal(false)}
                            className="absolute top-2.5 right-2.5 text-[#6e7681] hover:text-[#c9d1d9] p-1"
                        >
                            <X size={16} />
                        </button>
                        <h3 className="text-xs uppercase font-bold text-[#8b949e] mb-4 tracking-wider">
                            Scan QR to Open
                        </h3>
                        <div className="bg-white p-2.5 rounded">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                                    typeof window !== 'undefined' ? window.location.href : ''
                                )}`}
                                alt="Paste QR"
                                className="w-40 h-40"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Top Bar with actions: Delete, Download, Copy, Raw, QR */}
            <TopBar
                mode="view"
                expiryText={expiryText}
                onHome={handleHome}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onCopy={handleCopy}
                onRaw={handleRaw}
                onQrCode={() => setShowQrModal(true)}
            />

            {/* Full-width Workspace (NO right sidebar) */}
            <PasteViewer
                mode="view"
                file={paste.file}
                onAnywayClick={handleViewAnyway}
            />
        </div>
    );
}
