'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip';
import { FileUp, FolderUp, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { TopBar } from '~/_components/top-bar';
import { PasteViewer } from '~/_components/paste-viewer';
import {
    type SingleFile,
    MAX_SAFE_EDIT_BYTES,
    MAX_UPLOAD_BYTES,
    EXPIRY_OPTIONS,
    formatSize,
    countLines,
    isBinaryFile,
    readFirstMB,
} from '~/lib/utils';

export default function NewPastePage() {
    const router = useRouter();

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

    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const stats = useMemo(() => {
        const text = file.isText ? file.content : '';
        const lines = !file.isText ? 0 : countLines(text);
        const chars = text.length;
        const bytes = file.isText ? (file.blob ? file.blob.size : new Blob([text]).size) : file.size;
        const size = formatSize(bytes);

        return { lines, chars, bytes, size };
    }, [file]);

    const isOverUploadLimit = stats.bytes > MAX_UPLOAD_BYTES;

    const handleHome = () => {
        setFile({
            name: 'untitled',
            content: '',
            isText: true,
            isBinary: false,
            size: 0,
        });
        setTitle('');
    };

    const handleSingleFile = async (rawFile: File) => {
        setIsProcessing(true);
        setStatusMessage('Reading file...');

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

    const handleFolderUpload = async (rawFiles: FileList) => {
        const filesArray = Array.from(rawFiles);
        if (filesArray.length === 0) return;

        setIsProcessing(true);
        setStatusMessage(`Packing ${filesArray.length} items into ZIP...`);
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

    const handleEditAnyway = async () => {
        if (!file.blob) return;
        setIsProcessing(true);
        setStatusMessage('Reading text preview...');
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

    const handlePaste = async () => {
        if (isOverUploadLimit) return;
        setIsProcessing(true);
        setStatusMessage('Creating paste...');

        try {
            // Connects to your API endpoint or state store
            const formData = new FormData();
            formData.append('title', title || file.name);
            formData.append('expiry', expiry);
            formData.append('burnAfterReading', String(burnAfterReading));
            if (encrypt && password) formData.append('password', password);

            if (file.blob) {
                formData.append('file', file.blob, file.name);
            } else {
                formData.append('content', file.content);
            }

            const res = await fetch('/api', {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                router.push(`/${data.id}`);
            } else {
                // Standalone fallback: redirect to mock ID for testing
                const fallbackId = Math.random().toString(36).substring(2, 9);
                router.push(`/${fallbackId}`);
            }
        } catch {
            const fallbackId = Math.random().toString(36).substring(2, 9);
            router.push(`/${fallbackId}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col h-screen w-screen bg-[#0e1116] text-[#b8bfc9] font-mono select-none overflow-hidden text-sm relative">
            {isProcessing && (
                <div className="absolute inset-0 z-50 bg-black/75 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
                    <Loader2 className="animate-spin text-cyan-400" size={32} />
                    <p className="text-cyan-300 text-xs tracking-wider">{statusMessage}</p>
                </div>
            )}

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

            {/* Top Bar: Displays ONLY the Home button */}
            <TopBar mode="edit" onHome={handleHome} />

            <div className="flex flex-1 overflow-hidden">
                {/* Reusable Paste Viewer (Edit Mode) */}
                <PasteViewer
                    mode="edit"
                    file={file}
                    onChangeContent={(content) => setFile((prev) => ({ ...prev, content }))}
                    onAnywayClick={handleEditAnyway}
                    isDragging={isDragging}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                />

                {/* Right Sidebar */}
                <div className="w-64 bg-[#0e1116] border-l border-[#1b212b] flex flex-col justify-between text-xs p-3.5 select-none overflow-y-auto shrink-0">
                    <div className="space-y-4">
                        {/* UPLOAD */}
                        <div>
                            <label className="block text-xs text-[#6e7681] font-bold tracking-wider mb-2 uppercase">
                                UPLOAD
                            </label>
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

                        {/* NAME */}
                        <div>
                            <label className="block text-xs text-[#6e7681] font-bold tracking-wider mb-2 uppercase">
                                NAME
                            </label>
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
                            <label className="block text-xs text-[#6e7681] font-bold tracking-wider mb-2 uppercase">
                                EXPIRES
                            </label>
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
                            <label className="block text-xs text-[#6e7681] font-bold tracking-wider uppercase">
                                OPTIONS
                            </label>

                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-[#c9d1d9] text-xs">burn after reading</div>
                                    <div className="text-xs text-[#6e7681]">delete on first view</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setBurnAfterReading(!burnAfterReading)}
                                    className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${
                                        burnAfterReading ? 'bg-cyan-500' : 'bg-[#21262d]'
                                    }`}
                                >
                                    <div
                                        className={`w-4 h-4 rounded-full bg-black transition-transform ${
                                            burnAfterReading ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-[#c9d1d9] text-xs">encrypt</div>
                                    <div className="text-xs text-[#6e7681]">password-protect the paste</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEncrypt(!encrypt)}
                                    className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${
                                        encrypt ? 'bg-cyan-500' : 'bg-[#21262d]'
                                    }`}
                                >
                                    <div
                                        className={`w-4 h-4 rounded-full bg-black transition-transform ${
                                            encrypt ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

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

                    <div className="pt-4 border-t border-[#1b212b]/60 mt-3">
                        <div className="grid grid-cols-3 gap-2 text-xs text-[#6e7681] mb-2 uppercase">
                            <div>
                                <div>LINES</div>
                                <div className="text-[#c9d1d9] text-sm mt-0.5 font-semibold">
                                    {!file.isText ? '?' : stats.lines}
                                </div>
                            </div>
                            <div>
                                <div>CHARS</div>
                                <div className="text-[#c9d1d9] text-sm mt-0.5 font-semibold">
                                    {!file.isText ? '?' : stats.chars}
                                </div>
                            </div>
                            <div>
                                <div>BYTES</div>
                                <div className="text-[#c9d1d9] text-sm mt-0.5 font-semibold">{stats.bytes}</div>
                            </div>
                        </div>

                        <div className="flex justify-between text-xs mb-3">
                            <span className={isOverUploadLimit ? 'text-rose-400' : 'text-[#6e7681]'}>
                                {stats.size}
                            </span>
                            <span className={isOverUploadLimit ? 'text-rose-400' : 'text-[#6e7681]'}>
                                limit {formatSize(MAX_UPLOAD_BYTES)}
                            </span>
                        </div>

                        <button
                            disabled={isOverUploadLimit}
                            onClick={handlePaste}
                            className={`w-full py-2.5 text-sm font-bold tracking-wider transition-colors shadow-lg active:scale-[0.99] ${
                                isOverUploadLimit
                                    ? 'bg-[#21262d] text-[#6e7681] cursor-not-allowed'
                                    : 'bg-[#00d2d3] hover:bg-[#00e5ff] text-black'
                            }`}
                        >
                            {isOverUploadLimit ? 'file too large' : 'paste'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
