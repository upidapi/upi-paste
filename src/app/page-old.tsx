'use client';

import React, { useState, useMemo, useRef } from 'react';
import { FileUp, FolderUp, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import * as tus from 'tus-js-client';
import { downloadZip } from 'client-zip';

import TopBar from '~/_components/top-bar';
import PasteViewer from '~/_components/paste-viewer';
import { formatSize, countLines, isProbBinary } from '~/lib/utils';
import { EXPIRY_OPTIONS, MAX_SAFE_EDIT_BYTES, MAX_UPLOAD_BYTES } from '~/lib/const';
import { useRouter } from 'next/navigation';

const URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function readFirst(blob: Blob, maxBytes: number): Promise<string> {
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

interface SingleFile {
    name: string;
    content: string;
    isText: boolean;
    isBinary: boolean;
    isTruncated?: boolean;
    isFolder?: boolean;
    files?: File[];
    blob?: Blob;
    size: number;
}

export default function EditorPage() {
    const router = useRouter();

    const [file, setFile] = useState<SingleFile>({
        name: '',
        content: '',
        isText: true,
        isBinary: false,
        isFolder: false,
        size: 0,
    });

    const [title, setTitle] = useState('');
    const [expiry, setExpiry] = useState('1 week');
    const [oneTime, setOneTime] = useState(false);
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
        return { lines, chars, bytes, size: formatSize(bytes) };
    }, [file]);

    const isOverUploadLimit = stats.bytes > MAX_UPLOAD_BYTES;

    const handleSingleFile = async (rawFile: File) => {
        setIsProcessing(true);
        setStatusMessage('Reading file...');

        await new Promise((r) => setTimeout(r, 20));

        const isBinary = isProbBinary(
            new Uint8Array(
                await rawFile
                    .slice(
                        0,
                        MAX_SAFE_EDIT_BYTES, //
                    )
                    .arrayBuffer(),
            ),
        );
        const isText = !isBinary && rawFile.size <= MAX_SAFE_EDIT_BYTES;

        if (isText) {
            const text = await rawFile.text();
            setFile({
                name: rawFile.name,
                content: text,
                isText: true,
                isBinary: false,
                isFolder: false,
                blob: rawFile,
                size: rawFile.size,
            });
        } else {
            setFile({
                name: rawFile.name,
                content: '',
                isText: false,
                isBinary,
                isFolder: false,
                blob: rawFile,
                size: rawFile.size,
            });
        }
        setTitle(rawFile.name);
        setIsProcessing(false);
    };

    const handleFolderUpload = (rawFiles: FileList) => {
        const filesArray = Array.from(rawFiles);
        if (filesArray.length === 0) return;

        const folderName = filesArray[0]!.webkitRelativePath.split('/')[0] ?? 'archive';
        const totalSize = filesArray.reduce((acc, f) => acc + f.size, 0);
        const zipName = `${folderName}.zip`;

        setFile({
            name: zipName,
            content: '',
            isText: false,
            isBinary: true,
            isFolder: true,
            files: filesArray,
            size: totalSize,
        });
        setTitle(zipName);
    };

    // Type guards to narrow FileSystemEntry
    const isFileEntry = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;
    const isDirectoryEntry = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry => entry.isDirectory;

    const scanDirectory = async (entry: FileSystemEntry, basePath = ''): Promise<File[]> => {
        let files: File[] = [];
        const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;

        if (isFileEntry(entry)) {
            const file = await new Promise<File>((resolve, reject) => {
                entry.file(resolve, reject);
            });

            Object.defineProperty(file, 'webkitRelativePath', {
                value: currentPath,
                writable: true,
            });

            files.push(file);
        } else if (isDirectoryEntry(entry)) {
            const reader = entry.createReader();

            const readBatch = async (): Promise<FileSystemEntry[]> => {
                const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
                    reader.readEntries(resolve, reject);
                });

                if (batch.length > 0) {
                    const rest = await readBatch();
                    return batch.concat(rest);
                }
                return [];
            };

            const entries = await readBatch();
            const nested = await Promise.all(entries.map((childEntry) => scanDirectory(childEntry, currentPath)));

            files = files.concat(nested.flat());
        }

        return files;
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const item = e.dataTransfer.items?.[0];
        if (!item) return;

        const entry = item.webkitGetAsEntry?.();

        if (entry?.isDirectory) {
            setIsProcessing(true);
            setStatusMessage('Indexing directory structure...');

            const scannedFiles = await scanDirectory(entry);
            const totalSize = scannedFiles.reduce((acc, f) => acc + f.size, 0);
            const zipName = `${entry.name}.zip`;

            setFile({
                name: zipName,
                content: '',
                isText: false,
                isBinary: true,
                isFolder: true,
                files: scannedFiles,
                size: totalSize,
            });
            setTitle(zipName);
            setIsProcessing(false);
        } else {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile) await handleSingleFile(droppedFile);
        }
    };

    const handleEditAnyway = async () => {
        if (!file.blob || file.isFolder) return;

        setIsProcessing(true);
        setStatusMessage('Reading preview...');
        try {
            const text = await readFirst(file.blob, MAX_SAFE_EDIT_BYTES);
            const isTruncated = file.blob.size > MAX_SAFE_EDIT_BYTES;

            setFile((prev) => ({
                ...prev,
                content: text,
                isTruncated,
                isText: true,
                isBinary: false,
            }));
        } catch {
            alert('Failed to read file as text.');
        } finally {
            setIsProcessing(false);
        }
    };

    // zip folders on the fly and stream the upload via TUS
    const handlePaste = async () => {
        if (isOverUploadLimit) return;
        // you can have an empty password, it will just unlock instantly

        setIsProcessing(true);
        setStatusMessage('Preparing upload...');

        try {
            let uploadBlob: Blob;
            const uploadName = title.trim() || file.name;

            if (file.isFolder && file.files && file.files.length > 0) {
                setStatusMessage('Generating ZIP on the fly...');

                // Form an iterable of files keeping relative paths intact
                const filesToZip = file.files.map((f) => ({
                    name: f.webkitRelativePath || f.name,
                    input: f,
                    lastModified: new Date(f.lastModified),
                }));

                // downloadZip streams files sequentially without inflating uncompressed payload into RAM
                const zipResponse = downloadZip(filesToZip);
                uploadBlob = await zipResponse.blob();
            } else if (file.isText) {
                // If it's pure text or edited content
                uploadBlob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
            } else if (file.blob) {
                // Regular single binary file
                uploadBlob = file.blob;
            } else {
                throw new Error('No file payload found.');
            }

            // Stream to tus server
            await new Promise<string>((resolve, reject) => {
                const exp = EXPIRY_OPTIONS[expiry]!;

                let pasteId: string;
                let pasteToken: string;

                const upload = new tus.Upload(uploadBlob, {
                    endpoint: `${URL}/api/upload`,
                    retryDelays: [0, 1000, 3000, 5000],
                    chunkSize: 50 * 1024 * 1024,
                    metadata: {
                        json: JSON.stringify({
                            filename: uploadName,
                            filetype: uploadBlob.type || 'application/octet-stream',
                            expiry: exp == -1 ? -1 : Date.now() + exp * 1000,
                            oneTime: oneTime,
                            password: !encrypt ? '' : (password ?? ''),
                        }),
                    },
                    onError: (error) => {
                        reject(error);
                    },
                    onProgress: (bytesUploaded, bytesTotal) => {
                        // const percent = ((bytesUploaded / bytesTotal) * 100).toFixed(0);
                        setStatusMessage(`Uploading to server... ${formatSize(bytesUploaded)} / ${formatSize(bytesTotal)}`);
                    },
                    onAfterResponse(_req, res) {
                        pasteId = res.getHeader('X-Paste-Id') ?? res.getHeader('x-paste-id') ?? '';
                        pasteToken = res.getHeader('X-Paste-Token') ?? res.getHeader('x-paste-token') ?? '';
                    },
                    onSuccess: () => {
                        router.push(`/${encodeURIComponent(pasteId)}?t=${encodeURIComponent(pasteToken)}`);
                    },
                });

                upload.start();
            });

            setStatusMessage('Upload complete!');
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsProcessing(false);
            setStatusMessage('');
        }
    };

    return (
        <div className="flex flex-col h-screen w-screen bg-[#0e1116] text-[#b8bfc9] font-mono select-none overflow-hidden text-sm">
            <TopBar />

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
                onChange={async (e) => {
                    if (e.target.files?.[0]) await handleSingleFile(e.target.files[0]);
                    e.target.value = '';
                }}
            />
            <input
                type="file"
                ref={folderInputRef}
                {...{ webkitdirectory: '', directory: '' }}
                multiple
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) handleFolderUpload(e.target.files);
                    e.target.value = '';
                }}
            />

            <div className="flex flex-1 overflow-hidden">
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
                    <PasteViewer
                        value={file.content}
                        onChange={(content) => {
                            if (!file.isFolder) {
                                setFile((prev) => ({ ...prev, content }));
                            }
                        }}
                        fileName={file.name}
                        isBinary={!file.isText || file.isBinary}
                        isTruncated={file.isTruncated}
                        totalSize={stats.bytes}
                        isFolder={file.isFolder}
                        mode={'edit'}
                        onRevealAnyway={handleEditAnyway}
                    />
                </div>

                {/* Right Sidebar */}
                <div className="w-64 bg-[#0e1116] border-l border-[#1b212b] flex flex-col justify-between text-xs p-3.5 select-none overflow-y-auto">
                    <div className="space-y-4">
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

                        <div className="space-y-3.5 pt-1">
                            <label className="block text-xs text-[#6e7681] font-bold tracking-wider uppercase">OPTIONS</label>

                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-[#c9d1d9] text-xs">burn after reading</div>
                                    <div className="text-xs text-[#6e7681]">delete on first view</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setOneTime(!oneTime)}
                                    className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${oneTime ? 'bg-cyan-500' : 'bg-[#21262d]'}`}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-black transition-transform ${oneTime ? 'translate-x-4' : 'translate-x-0'}`} />
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
                                    className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${encrypt ? 'bg-cyan-500' : 'bg-[#21262d]'}`}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-black transition-transform ${encrypt ? 'translate-x-4' : 'translate-x-0'}`} />
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
        </div>
    );
}
