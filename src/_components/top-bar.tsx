'use client';

import React, { useState } from 'react';
import { Home, Trash2, Download, Copy, Check, FileCode, QrCode } from 'lucide-react';

interface TopBarProps {
    mode: 'edit' | 'view';
    expiryText?: string;
    onHome?: () => void;
    onDelete?: () => void;
    onDownload?: () => void;
    onCopy?: () => void;
    onRaw?: () => void;
    onQrCode?: () => void;
}

export function TopBar({
    mode,
    expiryText,
    onHome,
    onDelete,
    onDownload,
    onCopy,
    onRaw,
    onQrCode,
}: TopBarProps) {
    const [copied, setCopied] = useState(false);

    const handleCopyClick = () => {
        onCopy?.();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <header className="h-10 bg-[#0e1116] border-b border-[#1b212b] px-3.5 flex items-center justify-between select-none shrink-0 z-20">
            {/* Left: Home button (+ Expiry info in view mode) */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onHome}
                    title="Home (New paste)"
                    aria-label="Home"
                    className="text-[#8b949e] hover:text-[#c9d1d9] p-1.5 rounded hover:bg-[#161b22] transition-colors"
                >
                    <Home size={16} />
                </button>

                {mode === 'view' && expiryText && (
                    <span className="text-xs text-[#8b949e] font-mono tracking-tight select-text">
                        {expiryText}
                    </span>
                )}
            </div>

            {/* Right: Wastebin Action buttons (Only displayed in view mode) */}
            {mode === 'view' && (
                <div className="flex items-center gap-1">
                    {onDelete && (
                        <button
                            type="button"
                            onClick={onDelete}
                            title="Delete paste"
                            aria-label="Delete paste"
                            className="text-[#f85149] hover:text-[#ff7b72] hover:bg-[#f85149]/10 p-1.5 rounded transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    {onDownload && (
                        <button
                            type="button"
                            onClick={onDownload}
                            title="Download"
                            aria-label="Download"
                            className="text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22] p-1.5 rounded transition-colors"
                        >
                            <Download size={16} />
                        </button>
                    )}
                    {onRaw && (
                        <button
                            type="button"
                            onClick={onRaw}
                            title="Raw text"
                            aria-label="Raw text"
                            className="text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22] p-1.5 rounded transition-colors"
                        >
                            <FileCode size={16} />
                        </button>
                    )}
                    {onCopy && (
                        <button
                            type="button"
                            onClick={handleCopyClick}
                            title={copied ? 'Copied!' : 'Copy to clipboard'}
                            aria-label="Copy to clipboard"
                            className="text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22] p-1.5 rounded transition-colors"
                        >
                            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        </button>
                    )}
                    {onQrCode && (
                        <button
                            type="button"
                            onClick={onQrCode}
                            title="Show QR code"
                            aria-label="Show QR code"
                            className="text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22] p-1.5 rounded transition-colors"
                        >
                            <QrCode size={16} />
                        </button>
                    )}
                </div>
            )}
        </header>
    );
}
