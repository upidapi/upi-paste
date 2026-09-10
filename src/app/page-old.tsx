'use client';

import React, { useState, useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { FileUp, FolderUp, Lock, Eye, EyeOff, AlertTriangle, Loader2 } from 'lucide-react';
import { formatSize } from '~/lib/utils';

/* TODO: 
- lines only go to 10k
- you don't get truncation when you paste
- when you remote everyting in the editor from a trunicated file, and then 
  paste, what should happen?
- 
*/
interface SingleFile {
    name: string;
    content: string;
    isText: boolean;
    isBinary: boolean;
    isTruncated?: boolean;
    blob?: Blob;
    size: number;
}

const MAX_SAFE_EDIT_BYTES = 1 * 1024 * 1024; // 1 MB safe limit for React textarea
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB maximum paste/upload limit
const EXPIRY_OPTIONS = {
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
const MAX_LINES = 10_000;

// Inspects up to the first 1 MB for null bytes or excessive bogus control characters
const isBinaryFile = async (blob: Blob): Promise<boolean> => {
    const slice = blob.slice(0, 1024 * 1024);
    const buffer = new Uint8Array(await slice.arrayBuffer());

    let bogusControlChars = 0;
    for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i]!;
        // 0x00 (null byte) is an immediate binary indicator
        if (byte === 0) return true;
        // Flags non-text control characters (excluding \t, \n, \r)
        if (byte < 7 || (byte > 14 && byte < 32)) {
            bogusControlChars++;
        }
    }
    // Flag as binary if > 5% of characters are bogus control bytes
    return buffer.length > 0 && bogusControlChars / buffer.length > 0.05;
};

// Fast in-place line counter
const countLines = (str: string): number => {
    if (!str) return 1;
    let count = 1;
    for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) === 10) count++;
    }
    return count;
};

export default function WastebinEditor() {
    const [file, setFile] = useState<SingleFile>({
        name: 'untitled',
        content: '',
        isText: true,
        isBinary: false,
        size: 0,
    });

    const [title, setTitle] = useState('');
    const [expiry, setExpiry] = useState('1 month');
    const [burnAfterReading, setBurnAfterReading] = useState(false);
    const [encrypt, setEncrypt] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isAtBottom, setIsAtBottom] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const lineNumbersRef = useRef<HTMLPreElement>(null);

    // Fast stats calculation
    const stats = useMemo(() => {
        const text = file.isText ? file.content : '';
        const lines = !file.isText ? 0 : countLines(text);
        const chars = text.length;
        const bytes = file.isText ? (file.blob ? file.blob.size : new Blob([text]).size) : file.size;
        const size = formatSize(bytes);

        return { lines, chars, bytes, size };
    }, [file]);

    const isOverUploadLimit = stats.bytes > MAX_UPLOAD_BYTES;

    // High performance line numbers
    const lineNumbersText = useMemo(() => {
        if (!file.isText) return '';
        const maxRender = Math.min(stats.lines, MAX_LINES);
        let nums = '';
        for (let i = 1; i <= maxRender; i++) {
            nums += i + '\n';
        }
        if (stats.lines > 3000) nums += '...\n';
        return nums;
    }, [stats.lines, file.isText]);

    const checkIsAtBottom = (el: HTMLTextAreaElement) => {
        setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= 25);
    };

    // Handle single file selection
    const handleSingleFile = async (rawFile: File) => {
        setIsProcessing(true);
        setStatusMessage('Reading file...');
        setIsAtBottom(false);

        await new Promise((r) => setTimeout(r, 20));

        const isBinary = await isBinaryFile(rawFile);
        const isText = !isBinary && rawFile.size <= MAX_SAFE_EDIT_BYTES;

        if (isText) {
            const text = await rawFile.text();
            setFile({
                name: rawFile.name,
                content: text,
                isText: true,
                isBinary: false,
                blob: rawFile,
                size: rawFile.size,
            });
        } else {
            setFile({
                name: rawFile.name,
                content: '',
                isText: false,
                isBinary,
                blob: rawFile,
                size: rawFile.size,
            });
        }
        setTitle(rawFile.name);
        setIsProcessing(false);
    };

    const handlePaste = () => {
        if (isOverUploadLimit) return;

        console.log({
            title: title || file.name,
            expiry,
            burnAfterReading,
            encrypted: encrypt,
            password: encrypt ? password : null,
            file,
        });

        alert(`Created paste "${title || file.name}"!`);
    };

    // High-performance folder zipping
    const handleFolderUpload = async (rawFiles: FileList) => {
        const filesArray = Array.from(rawFiles);
        if (filesArray.length === 0) return;

        setIsProcessing(true);
        setStatusMessage(`Packing ${filesArray.length} items into ZIP...`);
        setIsAtBottom(false);
        await new Promise((r) => setTimeout(r, 20));

        const folderName = filesArray[0]!.webkitRelativePath.split('/')[0] || 'archive';
        const zip = new JSZip();

        for (const f of filesArray) {
            zip.file(f.webkitRelativePath || f.name, f);
        }

        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'STORE',
            streamFiles: true,
        });

        const zipName = `${folderName}.zip`;
        setFile({
            name: zipName,
            content: '',
            isText: false,
            isBinary: true,
            blob: zipBlob,
            size: zipBlob.size,
        });
        setTitle(zipName);
        setIsProcessing(false);
    };

    // Recursive dropped folder pack
    const zipDirectoryEntry = async (dirEntry: any, zipFolder: JSZip) => {
        const reader = dirEntry.createReader();
        const entries: any[] = await new Promise((res) => reader.readEntries(res));

        for (const entry of entries) {
            if (entry.isFile) {
                const fileObj = await new Promise<File>((res) => entry.file(res));
                zipFolder.file(entry.name, fileObj);
            } else if (entry.isDirectory) {
                const subFolder = zipFolder.folder(entry.name);
                if (subFolder) await zipDirectoryEntry(entry, subFolder);
            }
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const item = e.dataTransfer.items?.[0];
        if (!item) return;

        const entry = item.webkitGetAsEntry?.();

        if (entry?.isDirectory) {
            setIsProcessing(true);
            setStatusMessage('Scanning and packing directory...');
            setIsAtBottom(false);
            await new Promise((r) => setTimeout(r, 20));

            const zip = new JSZip();
            await zipDirectoryEntry(entry, zip);

            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'STORE',
                streamFiles: true,
            });

            const zipName = `${entry.name}.zip`;
            setFile({
                name: zipName,
                content: '',
                isText: false,
                isBinary: true,
                blob: zipBlob,
                size: zipBlob.size,
            });
            setTitle(zipName);
            setIsProcessing(false);
        } else {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile) handleSingleFile(droppedFile);
        }
    };

    async function readFirstMB(blob: Blob, maxBytes = 1024 * 1024): Promise<string> {
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

    // Simple, direct text loading for non-text views
    const handleEditAnyway = async () => {
        if (!file.blob) return;
        setIsProcessing(true);
        setStatusMessage('Reading text preview...');
        setIsAtBottom(false);
        try {
            const text = await readFirstMB(file.blob);
            const isTruncated = file.blob.size > 1024 * 1024;

            setFile((prev) => ({
                ...prev,
                content: text,
                isTruncated,
                isText: true,
            }));
        } catch {
            alert('Failed to read file as text.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex h-screen w-screen bg-[#0e1116] text-[#b8bfc9] font-mono select-none overflow-hidden text-sm relative">
            {/* Loading Overlay */}
            {isProcessing && (
                <div className="absolute inset-0 z-50 bg-black/75 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
                    <Loader2 className="animate-spin text-cyan-400" size={32} />
                    <p className="text-cyan-300 text-xs tracking-wider">{statusMessage}</p>
                </div>
            )}

            {/* Hidden inputs */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                    if (e.target.files?.[0]) handleSingleFile(e.target.files[0]);
                    e.target.value = '';
                }}
            />
            <input
                type="file"
                ref={folderInputRef}
                {...({ webkitdirectory: '', directory: '' } as any)}
                multiple
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) handleFolderUpload(e.target.files);
                    e.target.value = '';
                }}
            />

            {/* Main Workspace (Left) */}
            <div
                className={`flex-1 flex flex-col relative transition-colors ${
                    isDragging ? 'bg-[#151d28] border-2 border-dashed border-cyan-400' : 'bg-[#0b0e14]'
                }`}
                onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
            >
                {file.isText ? (
                    /* TEXT EDITOR */
                    <div className="flex flex-1 overflow-hidden relative">
                        <pre
                            ref={lineNumbersRef}
                            className="w-14 pt-3 pb-12 bg-[#0b0e14] text-[#444c56] text-right pr-3 select-none font-mono text-xs leading-6 overflow-hidden border-r border-[#1b212b]/40"
                        >
                            {lineNumbersText}
                        </pre>

                        <textarea
                            value={file.content}
                            onChange={(e) => {
                                setFile((prev) => ({ ...prev, content: e.target.value }));
                                checkIsAtBottom(e.currentTarget);
                            }}
                            onScroll={(e) => {
                                if (lineNumbersRef.current) {
                                    lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
                                }
                                checkIsAtBottom(e.currentTarget);
                            }}
                            placeholder="paste, type, or drop a file or folder here ..."
                            className="flex-1 h-full pt-3 pb-12 px-4 bg-transparent outline-none resize-none font-mono text-xs leading-6 text-[#d0d7de] placeholder-[#444c56] selection:bg-cyan-500/20 whitespace-pre-wrap overflow-auto"
                            spellCheck={false}
                        />

                        {/* Minimal grayed-out indicator below text when scrolled to bottom */}
                        {file.isTruncated && isAtBottom && (
                            <div className="absolute bottom-3 left-14 pl-4 font-mono text-xs text-[#6e7681] select-none pointer-events-none">
                                ... Truncated to {formatSize(MAX_SAFE_EDIT_BYTES)}
                            </div>
                        )}
                    </div>
                ) : (
                    /* BINARY & LARGE FILE PLACEHOLDER */
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
                        <AlertTriangle size={36} className={file.isBinary ? 'text-cyan-400/80' : 'text-amber-400/80'} />
                        <p className="text-[#c9d1d9] font-semibold text-sm mt-3">{file.name}</p>
                        <p className="text-xs text-[#6e7681] mt-1 mb-4">
                            {file.isBinary ? `Binary file detected (${stats.size}).` : `Large text file detected (${stats.size}).`}
                        </p>
                        <button
                            onClick={handleEditAnyway}
                            className="px-3.5 py-1.5 border border-[#30363d] text-cyan-400 hover:border-cyan-400 hover:bg-cyan-400/5 text-xs transition-colors font-medium active:scale-95"
                        >
                            Edit anyway
                        </button>
                    </div>
                )}
            </div>

            {/* Right Sidebar */}
            <div className="w-64 bg-[#0e1116] border-l border-[#1b212b] flex flex-col justify-between text-xs p-3.5 select-none overflow-y-auto">
                <div className="space-y-4">
                    {/* UPLOAD BUTTONS */}
                    <div>
                        <label className="block text-xs text-[#6e7681] font-bold tracking-wider mb-2 uppercase">UPLOAD</label>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center justify-center gap-1.5 py-2 border border-[#1b212b] text-[#8b949e] hover:border-cyan-500/40 hover:text-cyan-400 bg-[#080b0f] transition-colors text-xs"
                            >
                                <FileUp size={14} />
                                <span>File</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => folderInputRef.current?.click()}
                                className="flex items-center justify-center gap-1.5 py-2 border border-[#1b212b] text-[#8b949e] hover:border-cyan-500/40 hover:text-cyan-400 bg-[#080b0f] transition-colors text-xs"
                            >
                                <FolderUp size={14} />
                                <span>Folder (ZIP)</span>
                            </button>
                        </div>
                    </div>

                    {/* TITLE */}
                    <div>
                        <label className="block text-xs text-[#6e7681] font-bold tracking-wider mb-2 uppercase">NAME</label>
                        <input
                            type="text"
                            placeholder="untitled"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-[#080b0f] border border-[#1b212b] px-3 py-2 text-xs text-[#c9d1d9] placeholder-[#444c56] focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                    </div>

                    {/* EXPIRES */}
                    <div>
                        <label className="block text-xs text-[#6e7681] font-bold tracking-wider mb-2 uppercase">EXPIRES</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {Object.keys(EXPIRY_OPTIONS).map((opt) => (
                                <button
                                    key={opt}
                                    onClick={() => setExpiry(opt)}
                                    className={`py-1.5 text-center border text-xs transition-colors ${
                                        expiry === opt
                                            ? 'border-cyan-400 text-cyan-400 bg-cyan-400/5'
                                            : 'border-[#1b212b] text-[#8b949e] hover:border-[#30363d] hover:text-[#c9d1d9]'
                                    }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* OPTIONS */}
                    <div className="space-y-3.5 pt-1">
                        <label className="block text-xs text-[#6e7681] font-bold tracking-wider uppercase">OPTIONS</label>

                        {/* Burn after reading */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-[#c9d1d9] text-xs">burn after reading</div>
                                <div className="text-xs text-[#6e7681]">delete on first view</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setBurnAfterReading(!burnAfterReading)}
                                className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${burnAfterReading ? 'bg-cyan-500' : 'bg-[#21262d]'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-black transition-transform ${burnAfterReading ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Encrypt Toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-[#c9d1d9] text-xs">encrypt</div>
                                <div className="text-xs text-[#6e7681]">password-protect the paste</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEncrypt(!encrypt)}
                                className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${encrypt ? 'bg-cyan-500' : 'bg-[#21262d]'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-black transition-transform ${encrypt ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Password Input */}
                        {encrypt && (
                            <div className="relative mt-2">
                                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[#6e7681]">
                                    <Lock size={14} />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Enter password..."
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-[#080b0f] border border-[#1b212b] pl-8 pr-8 py-2 text-xs text-[#c9d1d9] placeholder-[#444c56] focus:outline-none focus:border-cyan-500 transition-colors"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#6e7681] hover:text-cyan-400"
                                >
                                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Stats & Submit Button */}
                <div className="pt-4 border-t border-[#1b212b]/60 mt-3">
                    <div className="grid grid-cols-3 gap-2 text-xs text-[#6e7681] mb-2 uppercase">
                        <div>
                            <div>LINES</div>
                            <div className="text-[#c9d1d9] text-sm mt-0.5 font-semibold">{!file.isText ? '?' : stats.lines}</div>
                        </div>
                        <div>
                            <div>CHARS</div>
                            <div className="text-[#c9d1d9] text-sm mt-0.5 font-semibold">{!file.isText ? '?' : stats.chars}</div>
                        </div>
                        <div>
                            <div>BYTES</div>
                            <div className="text-[#c9d1d9] text-sm mt-0.5 font-semibold">{stats.bytes}</div>
                        </div>
                    </div>

                    <div className="flex justify-between text-xs mb-3">
                        <span className={isOverUploadLimit ? 'text-rose-400' : 'text-[#6e7681]'}>{stats.size}</span>
                        <span className={isOverUploadLimit ? 'text-rose-400' : 'text-[#6e7681]'}>limit {formatSize(MAX_UPLOAD_BYTES)}</span>
                    </div>

                    {/* Paste Button */}
                    <button
                        disabled={isOverUploadLimit}
                        onClick={handlePaste}
                        className={`w-full py-2.5 text-sm font-bold tracking-wider transition-colors shadow-lg active:scale-[0.99] ${
                            isOverUploadLimit ? 'bg-[#21262d] text-[#6e7681] cursor-not-allowed' : 'bg-[#00d2d3] hover:bg-[#00e5ff] text-black'
                        }`}
                    >
                        {isOverUploadLimit ? 'file too large' : 'paste'}
                    </button>
                </div>
            </div>
        </div>
    );
}
