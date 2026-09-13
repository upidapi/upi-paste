'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { countLines, formatSize } from '~/lib/utils';
import { MAX_SAFE_EDIT_BYTES } from '~/lib/const';

const MAX_LINES = 10_000;

interface PasteViewerProps {
    value: string;
    onChange?: (value: string) => void;
    fileName: string;
    isFolder?: boolean;
    isBinary: boolean;
    isTruncated: boolean;
    acceptedWarning: boolean;
    onAcceptedWarning: () => void;
    totalSize: number;
    mode: 'edit' | 'view';
    placeholder: string;
}

export default function PasteViewer({
    value,
    onChange = () => ({}),
    fileName,
    isFolder = false,
    isBinary,
    isTruncated,
    acceptedWarning, 
    onAcceptedWarning, 
    totalSize,
    mode,
    placeholder,
}: PasteViewerProps) {
    const [isAtBottom, setIsAtBottom] = useState(false);
    const lineNumbersRef = useRef<HTMLPreElement>(null);

    const isTextMode = !isBinary && !isFolder;
    const linesCount = isTextMode ? countLines(value) : 0;

    const lineNumbersText = useMemo(() => {
        if (!isTextMode) return '';
        const maxRender = Math.min(linesCount, MAX_LINES);
        let nums = '';
        for (let i = 1; i <= maxRender; i++) {
            nums += i + '\n';
        }
        if (linesCount > MAX_LINES) nums += '...\n';
        return nums;
    }, [linesCount, isTextMode]);

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        const target = e.currentTarget;
        if (lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = target.scrollTop;
        }
        setIsAtBottom(target.scrollHeight - target.scrollTop - target.clientHeight <= 25);
    };

    // Folder warning (error)
    if (isFolder) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto select-none font-mono">
                <AlertTriangle size={36} className="text-rose-400" />
                <p className="text-[#c9d1d9] font-semibold text-sm mt-3">{fileName}</p>
                <p className="text-xs text-rose-400 mt-1">Folders cannot be previewed or edited</p>
                <p className="text-xs text-[#6e7681] mt-1">Packaged as TAR archive</p>
            </div>
        );
    }

    // Binary Warning
    if ((isBinary || isTruncated) && !acceptedWarning) {
        const fileType =
            isTruncated && isBinary //
                ? 'Large binary '
                : isBinary
                  ? 'Binary '
                  : 'Large ';

        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto select-none font-mono">
                <AlertTriangle size={36} className="text-cyan-400/80" />
                <p className="text-[#c9d1d9] font-semibold text-sm mt-3">{fileName}</p>
                <p className="text-xs text-[#6e7681] mt-1 mb-4">
                    {fileType} file detected ({formatSize(totalSize)}).
                </p>
                <button
                    type="button"
                    onClick={onAcceptedWarning}
                    className="px-3.5 py-1.5 border border-[#30363d] text-cyan-400 hover:border-cyan-400 hover:bg-cyan-400/5 text-xs transition-colors font-medium active:scale-95"
                >
                    {mode === 'edit' ? 'Edit anyway' : 'View anyway'}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-1 overflow-hidden relative font-mono text-xs leading-6 bg-[#0b0e14]">
            {/* Synchronized Line Numbers */}
            <pre
                ref={lineNumbersRef}
                className="w-14 pt-3 pb-12 bg-[#0b0e14] text-[#444c56] text-right pr-3 select-none overflow-hidden border-r border-[#1b212b]/40"
            >
                {lineNumbersText}
            </pre>

            {/* Editor or Read-Only Viewer */}
            <textarea
                value={value}
                readOnly={mode === 'view'}
                onChange={(e) => onChange?.(e.target.value)}
                onScroll={handleScroll}
                placeholder={placeholder}
                spellCheck={false}
                className="flex-1 h-full pt-3 pb-12 px-4 bg-transparent outline-none resize-none text-[#d0d7de] placeholder-[#444c56] selection:bg-cyan-500/20 whitespace-pre-wrap overflow-auto"
            />

            {/* Truncation indicator shown at scroll bottom */}
            {isTruncated && isAtBottom && (
                <div className="absolute bottom-3 left-14 pl-4 font-mono text-xs text-[#6e7681] select-none pointer-events-none">
                    ... Truncated to {formatSize(MAX_SAFE_EDIT_BYTES)}
                </div>
            )}
        </div>
    );
}
