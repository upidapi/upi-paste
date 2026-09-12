'use client';

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Trash2, Download, Copy, Check, Lock, AlertTriangle, KeyRound, ArrowRight } from 'lucide-react';
import TopBar from '~/_components/top-bar';
import PasteViewer from '~/_components/paste-viewer';
import * as z from 'zod';
import { useQuery } from '@tanstack/react-query';

// 1. Defined outside component for clean type evaluation
const PasteSchema = z.object({
    filename: z.string(),
    filetype: z.string(),
    oneTime: z.boolean(),
    expiry: z.number(),
    size: z.number(),
    preview: z.string().optional().default(''),
    isBinary: z.boolean().optional().default(false),
    isTruncated: z.boolean().optional().default(false),
});

type ResourceData = z.infer<typeof PasteSchema>;

export default function PastePage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    const [copied, setCopied] = useState(false);

    // Password & Gate States
    // 2. Active password sent to API, defaults to "" as requested
    const [submittedPassword, setSubmittedPassword] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [isPasswordRequired, setIsPasswordRequired] = useState(false);
    const [isPasswordError, setIsPasswordError] = useState(false);

    // If oneTime is enabled, prevent showing content until user explicitly confirms
    const [oneTimeConfirmed, setOneTimeConfirmed] = useState(false);

    // 3. TanStack Query: Runs on mount with password = "", and refetches when submittedPassword updates
    const {
        data: resource,
        isLoading,
        isFetching,
        refetch,
    } = useQuery<ResourceData>({
        queryKey: ['resource', id, submittedPassword],
        queryFn: async () => {
            setIsPasswordError(false);

            const response = await fetch(`/api/resource`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, password: submittedPassword }),
            });

            if (response.status === 401 || response.status === 403) {
                setIsPasswordRequired(true);
                if (submittedPassword !== '') {
                    setIsPasswordError(true);
                }
                throw new Error('Password required or incorrect');
            }

            if (!response.ok) {
                throw new Error('Failed to load resource');
            }

            const raw: unknown = await response.json();
            const parsed = PasteSchema.parse(raw);
            setIsPasswordRequired(false);
            return parsed;
        },
        retry: false, // Don't spam retries on wrong passwords
    });

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordInput) return;

        if (passwordInput === submittedPassword) {
            void refetch();
        } else {
            setSubmittedPassword(passwordInput);
        }
    };

    const handleCopy = async () => {
        if (!resource?.preview) return;
        await navigator.clipboard.writeText(resource.preview);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        if (!resource) return;
        const blob = new Blob([resource.preview || ''], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = resource.filename || `${id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this paste?')) return;
        try {
            await fetch(`/api/${id}`, { method: 'DELETE' });
        } catch {
            // Callback stub
        }
        router.push('/');
    };

    return (
        <div className="flex flex-col h-screen w-screen bg-[#0b0e14] text-[#b8bfc9] font-mono select-none overflow-hidden text-sm">
            <TopBar showExpiry={resource ? resource.expiry !== -1 : false} expiresAt={resource?.expiry ?? -1}>
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
                    disabled={isPasswordRequired || !resource}
                    className="p-1.5 text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#1b212b]/60 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                    <Download size={16} />
                </button>
                <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy to clipboard"
                    disabled={isPasswordRequired || !resource}
                    className="p-1.5 text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#1b212b]/60 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                    {copied ? <Check size={16} className="text-cyan-400" /> : <Copy size={16} />}
                </button>
            </TopBar>

            <div className="flex-1 flex flex-col overflow-hidden relative">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-[#6e7681]">Loading paste...</div>
                ) : isPasswordRequired ? (
                    /* 1. PASSWORD REQUIRED PROMPT */
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
                                    onChange={(e) => {
                                        setPasswordInput(e.target.value);
                                        setIsPasswordError(false);
                                    }}
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
                ) : resource?.oneTime && !oneTimeConfirmed ? (
                    /* 2. ONE-TIME BURN GATE */
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto select-none font-mono">
                        <AlertTriangle size={36} className="text-rose-400 mb-3" />
                        <h2 className="text-[#c9d1d9] font-semibold text-sm">Self-Destructing Paste</h2>
                        <p className="text-xs text-[#6e7681] mt-1 mb-5">
                            This paste will be immediately destroyed after being revealed. Ensure you are ready to view or save it.
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
                    /* 3. NORMAL VIEWER */
                    <PasteViewer
                        value={resource?.preview || ''}
                        fileName={resource?.filename || ''}
                        isBinary={resource?.isBinary || false}
                        isTruncated={resource?.isTruncated || false}
                        totalSize={resource?.size || 0}
                        mode="view"
                        placeholder=""
                    />
                )}
            </div>
        </div>
    );
}
