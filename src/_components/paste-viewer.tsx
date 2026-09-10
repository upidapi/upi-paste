'use client';

import React, { useState, useMemo, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
    type SingleFile,
    MAX_LINES,
    MAX_SAFE_EDIT_BYTES,
    countLines,
    formatSize,
} from '~/lib/utils';

interface PasteViewerProps {
    mode: 'edit' | 'view';
    file: SingleFile;
    onChangeContent?: (value: string) => void;
    onAnywayClick?: () => void;
    isDragging?: boolean;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
    placeholder?: string;
}

export function PasteViewer({
    mode,
    file,
    onChangeContent,
    onAnywayClick,
    isDragging = false,
    onDragOver,
    onDragLeave,
    onDrop,
    placeholder,
}: PasteViewerProps) {
    const lineNumbersRef = useRef<HTMLPreElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(false);

    const checkIsAtBottom = (el: HTMLElement) => {
        setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= 25);
    };

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        if (lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
        }
        checkIsAtBottom(e.currentTarget);
    };

    const linesCount = useMemo(() => {
        if (!file.isText) return 0;
        return countLines(file.content);
    }, [file.content, file.isText]);

    const lineNumbersText = useMemo(() => {
        if (!file.isText) return '';
        const maxRender = Math.min(linesCount, MAX_LINES);
        let nums = '';
        for (let i = 1; i <= maxRender; i++) {
            nums += i + '\n';
        }
        if (linesCount > 3000) nums += '...\n';
        return nums;
    }, [linesCount, file.isText]);

    const displaySize = useMemo(() => {
        const bytes = file.isText
            ? (file.blob ? file.blob.size : new Blob([file.content]).size)
            : file.size;
        return formatSize(bytes);
    }, [file]);

    return (
        <div
            className={`flex-1 flex flex-col relative transition-colors ${
                isDragging ? 'bg-[#151d28] border-2 border-dashed border-cyan-400' : 'bg-[#0b0e14]'
            }`}
            onDragOver={mode === 'edit' ? onDragOver : undefined}
            onDragLeave={mode === 'edit' ? onDragLeave : undefined}
            onDrop={mode === 'edit' ? onDrop : undefined}
        >
            {file.isText ? (
                /* TEXT EDITOR / VIEWER */
                <div className="flex flex-1 overflow-hidden relative">
                    <pre
                        ref={lineNumbersRef}
                        className="w-14 pt-3 pb-12 bg-[#0b0e14] text-[#444c56] text-right pr-3 select-none font-mono text-xs leading-6 overflow-hidden border-r border-[#1b212b]/40"
                    >
                        {lineNumbersText}
                    </pre>

                    <textarea
                        readOnly={mode === 'view'}
                        value={file.content}
                        onChange={(e) => {
                            if (mode === 'edit') {
                                onChangeContent?.(e.target.value);
                                checkIsAtBottom(e.currentTarget);
                            }
                        }}
                        onScroll={handleScroll}
                        placeholder={mode === 'edit' ? placeholder || 'paste, type, or drop a file or folder here ...' : ''}
                        className={`flex-1 h-full pt-3 pb-12 px-4 bg-transparent outline-none resize-none font-mono text-xs leading-6 text-[#d0d7de] selection:bg-cyan-500/20 whitespace-pre-wrap overflow-auto ${
                            mode === 'view' ? 'cursor-text' : 'placeholder-[#444c56]'
                        }`}
                        spellCheck={false}
                    />

                    {/* Truncation indicator displayed at bottom */}
                    {file.isTruncated && isAtBottom && (
                        <div className="absolute bottom-3 left-14 pl-4 font-mono text-xs text-[#6e7681] select-none pointer-events-none">
                            ... Truncated to {formatSize(MAX_SAFE_EDIT_BYTES)}
                        </div>
                    )}
                </div>
            ) : (
                /* BINARY & LARGE FILE WARNING (Identical in both view & edit) */
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto select-none">
                    <AlertTriangle size={36} className={file.isBinary ? 'text-cyan-400/80' : 'text-amber-400/80'} />
                    <p className="text-[#c9d1d9] font-semibold text-sm mt-3">{file.name}</p>
                    <p className="text-xs text-[#6e7681] mt-1 mb-4">
                        {file.isBinary
                            ? `Binary file detected (${displaySize}).`
                            : `Large text file detected (${displaySize}).`}
                    </p>
                    {onAnywayClick && (
                        <button
                            type="button"
                            onClick={onAnywayClick}
                            className="px-3.5 py-1.5 border border-[#30363d] text-cyan-400 hover:border-cyan-400 hover:bg-cyan-400/5 text-xs transition-colors font-medium active:scale-95"
                        >
                            {mode === 'view' ? 'View anyway' : 'Edit anyway'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
