'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Trash2, Download, Copy, Lock, AlertTriangle, KeyRound, ArrowRight, FileQuestion, Check } from 'lucide-react';
import TopBar from '~/_components/top-bar';
import PasteViewer from '~/_components/paste-viewer';
import * as z from 'zod';
import { useQuery } from '@tanstack/react-query';
import { isProbBinary } from '~/lib/utils';

const PasteSchema = z.object({
    filename: z.string(),
    filetype: z.string(),
    oneTime: z.boolean(),
    expiry: z.number(),
    size: z.number(),
});

// TODO: add a visual timeout for the auto delete after preview
//  also make it actually burn after that time

export default function PastePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();

    const id = params.id! as string;
    const ownerToken = searchParams.get('t') ?? '';

    const [gone, setGone] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [submittedPassword, setSubmittedPassword] = useState('');
    const [oneTimeConfirmed, setOneTimeConfirmed] = useState(false);
    const [acceptedWarning, setAcceptedWarning] = useState(false);
    const [copied, setCopied] = useState(false);

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ['resource', id, submittedPassword],
        queryFn: async () => {
            const searchParams = new URLSearchParams(submittedPassword === '' ? {} : { p: submittedPassword });
            const res = await fetch(`/api/${id}/metadata?${searchParams.toString()}`);

            if (!res.ok) {
                throw new Error(String(res.status));
            }

            return {
                password: submittedPassword,
                ...PasteSchema.parse(await res.json()),
            };
        },
        retry: false,
    });

    const mPaste = data ?? {
        filename: '',
        filetype: '',
        oneTime: false,
        expiry: -1,
        size: -1,
        password: '',
    };

    // Semantic status checks
    const isNotFound = error?.message === '404' || gone;
    const isLocked = error?.message === '401' || error?.message === '403';
    const isPasswordError = error?.message === '403';

    const { data: data2 } = useQuery({
        queryKey: ['preview', id, submittedPassword],
        queryFn: async () => {
            const sParams = new URLSearchParams({ psw: submittedPassword });
            const res = await fetch(`/api/${id}/preview?${sParams.toString()}`);
            if (!res.ok) throw new Error(String(res.status));
            return res.json() as Promise<{ preview: string; previewToken: string }>;
        },
        select: (res) => {
            const uPreview = Uint8Array.from(atob(res.preview), (c) => c.charCodeAt(0));

            return {
                preview: new TextDecoder().decode(uPreview),
                previewToken: res.previewToken,
                isBinary: isProbBinary(uPreview),
                isTruncated: uPreview.length < mPaste.size,
            };
        },
        // Only fetch when unlocked, not 404, AND confirmed (if one-time)
        enabled: !!data && !isLocked && !isNotFound && (!data.oneTime || oneTimeConfirmed),
        retry: false,
    });

    const paste = {
        preview: data2?.preview ?? '',
        previewToken: data2?.previewToken ?? '',
        isBinary: data2?.isBinary ?? false,
        isTruncated: data2?.isTruncated ?? false,
    };

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordInput || isFetching) return;
        setSubmittedPassword(passwordInput);
    };

    const handleDownload = () => {
        const searchParams = new URLSearchParams({ psw: mPaste.password, h: paste.previewToken });
        const url = `/api/${id}?${searchParams.toString()}`;

        const a = document.createElement('a');
        a.href = url;
        console.log(mPaste);
        a.download = mPaste.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (mPaste.oneTime) setGone(true);
    };

    const handleCopy = async () => {
        const searchParams = new URLSearchParams({ p: mPaste.password, h: paste.previewToken });
        const url = `/api/${id}?${searchParams.toString()}`;

        try {
            if (navigator.clipboard && window.ClipboardItem) {
                // Passing a Promise to ClipboardItem preserves user activation while fetching
                const textPromise = fetch(url).then(async (res) => {
                    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
                    const text = await res.text();
                    return new Blob([text], { type: 'text/plain' });
                });

                await navigator.clipboard.write([new ClipboardItem({ 'text/plain': textPromise })]);
            } else {
                // Fallback for older browsers
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
                const text = await res.text();
                await navigator.clipboard.writeText(text);
            }

            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
        } catch (err) {
            console.error('Failed to copy paste content:', err);
        }

        if (mPaste.oneTime) setGone(true);
    };

    const handleDelete = async () => {
        // TODO: remove?
        if (!confirm('Are you sure you want to delete this paste?')) return;
        try {
            const res = await fetch(`/api/${id}?t=${ownerToken}`, { method: 'DELETE' });

            if (!res.ok) {
                alert('failed to delete paste');
                return;
            }
        } catch {
            alert('failed to delete paste');
            return;
        }
        router.push('/');
    };

    // make paste/download red when one time
    const oneTimeRed = !mPaste.oneTime ? '' : 'text-rose-400';
    return (
        <div className="flex flex-col h-screen w-screen bg-[#0b0e14] text-[#b8bfc9] font-mono select-none overflow-hidden text-sm">
            <TopBar showExpiry={!isNotFound && mPaste.expiry !== -1} expiresAt={mPaste.expiry}>
                {!(isNotFound || isLoading || ownerToken == '') && (
                    <button
                        type="button"
                        onClick={handleDelete}
                        title="Delete"
                        className="p-1.5 text-[#8b949e] hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
                {!(isNotFound || isLocked || isLoading) && (
                    <>
                        <button
                            type="button"
                            onClick={handleDownload}
                            title="Download"
                            // disabled={!paste.preview}
                            className={`${oneTimeRed} p-1.5 text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#1b212b]/60 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none`}
                        >
                            <Download size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={handleCopy}
                            title="Copy to clipboard"
                            // disabled={!paste.preview}
                            className={`${oneTimeRed} p-1.5 text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#1b212b]/60 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none`}
                        >
                            {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                            {/* <Copy size={16} /> */}
                        </button>
                    </>
                )}
            </TopBar>

            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* 1. NOT FOUND PROMPT */}
                {isNotFound ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto select-none font-mono">
                        <div className="w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center mb-3">
                            <FileQuestion size={22} className="text-cyan-400" />
                        </div>
                        <h2 className="text-[#c9d1d9] font-semibold text-sm">Paste Not Found</h2>
                        <p className="text-xs text-[#6e7681] mt-1 mb-5">This paste does not exist: it has burned, expired, or been removed.</p>
                        <Link
                            href="/"
                            className="px-4 py-2 border border-[#30363d] text-cyan-400 hover:border-cyan-400 hover:bg-cyan-400/5 text-xs transition-colors font-medium active:scale-95"
                        >
                            Create new paste
                        </Link>
                    </div>
                ) : isLocked ? (
                    /* 2. PASSWORD REQUIRED PROMPT */
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto select-none font-mono">
                        <div className="w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center mb-3">
                            <Lock size={22} className="text-cyan-400" />
                        </div>
                        <h2 className="text-[#c9d1d9] font-semibold text-sm">Password Protected</h2>
                        <p className="text-xs text-[#6e7681] mt-1 mb-5">Enter the password to decrypt and view this paste.</p>

                        <form onSubmit={handlePasswordSubmit} className="w-full flex flex-col gap-2">
                            <div className="relative">
                                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6e7681]" />
                                <input
                                    type="password"
                                    value={passwordInput}
                                    onChange={(e) => setPasswordInput(e.target.value)}
                                    placeholder="Enter password..."
                                    autoFocus
                                    className={`w-full bg-[#161b22] border text-[#c9d1d9] text-xs pl-8 pr-3 py-2 outline-none transition-colors placeholder-[#444c56] ${
                                        isPasswordError ? 'border-rose-500 focus:border-rose-400' : 'border-[#30363d] focus:border-cyan-400'
                                    }`}
                                />
                            </div>

                            {isPasswordError && <p className="text-[11px] text-rose-400 text-left">Incorrect password. Please try again.</p>}

                            <button
                                type="submit"
                                disabled={isFetching || !passwordInput}
                                className="flex items-center justify-center gap-1.5 w-full py-2 border border-[#30363d] text-cyan-400 hover:border-cyan-400 hover:bg-cyan-400/5 text-xs transition-colors font-medium active:scale-95 disabled:opacity-40 disabled:pointer-events-none mt-1"
                            >
                                <span>{isFetching ? 'Unlocking...' : 'Unlock'}</span>
                                <ArrowRight size={13} />
                            </button>
                        </form>
                    </div>
                ) : mPaste.oneTime && !oneTimeConfirmed ? (
                    /* 3. ONE-TIME BURN GATE */
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto select-none font-mono">
                        <AlertTriangle size={36} className="text-rose-400 mb-3" />
                        <h2 className="text-[#c9d1d9] font-semibold text-sm">Self-Destructing Paste</h2>
                        <p className="text-xs text-[#6e7681] mt-1 mb-5">
                            This paste will be immediately destroyed after being revealed, copied or downloaded. Ensure you are ready to view or save it.
                        </p>
                        <button
                            type="button"
                            onClick={() => setOneTimeConfirmed(true)}
                            className="px-4 py-2 border border-rose-500/50 text-rose-400 hover:border-rose-400 hover:bg-rose-500/10 text-xs transition-colors font-medium active:scale-95"
                        >
                            Reveal and burn
                        </button>
                    </div>
                ) : (
                    /* 4. NORMAL VIEWER */
                    <PasteViewer
                        value={paste.preview}
                        fileName={mPaste.filename}
                        isBinary={paste.isBinary}
                        isTruncated={paste.isTruncated}
                        totalSize={mPaste.size}
                        mode="view"
                        placeholder=""
                        acceptedWarning={acceptedWarning}
                        onAcceptedWarning={() => setAcceptedWarning(true)}

                        // onRevealAnyway={handleViewAnyway}
                    />
                )}
            </div>
        </div>
    );
}
