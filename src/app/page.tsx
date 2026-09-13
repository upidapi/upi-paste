'use client';

import React, { useState, useMemo, useRef } from 'react';
import { FileUp, FolderUp, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import * as tus from 'tus-js-client';
import { downloadZip, predictLength } from 'client-zip';
import { createTarPacker } from 'modern-tar';
import { useRouter } from 'next/navigation';

import TopBar from '~/_components/top-bar';
import PasteViewer from '~/_components/paste-viewer';
import { formatSize, countLines, isProbBinary } from '~/lib/utils';
import { EXPIRY_OPTIONS, MAX_SAFE_EDIT_BYTES, MAX_UPLOAD_BYTES, URL } from '~/lib/const';

// TODO: make a more obvious way to clear the current paste edit
//  important since user is locked out of editing on truncated files

/**
 * Archive format switch:
 * - 'tar': Uses `modern-tar`. Zero CPU overhead, streams at full SSD/network wire speed. Recommended for multi-GB folders.
 * - 'zip': Uses `client-zip`. Computes CRC-32 in JavaScript, CPU-bound at ~20-40 MB/s.
 */
// if you change this, change all references to tar <-> zip
const ARCHIVE_FORMAT: 'tar' | 'zip' = 'tar';

const UPLOAD_CHUNK_SIZE = 32 * 1024 * 1024;
const SLICE_SIZE = 4 * 1024 * 1024;

// =============================================================================
// HELPERS
// =============================================================================

const textEncoder = new TextEncoder();

interface CustomFile extends File {
    customRelativePath?: string;
}

interface SingleFile {
    name: string;
    content: string;
    isText: boolean;
    isBinary: boolean;
    isTruncated: boolean;
    isFolder: boolean;
    files?: CustomFile[];
    blob?: Blob;
    size: number;
}

// Predicts exact TAR archive size upfront so TUS can report accurate progress
function estimateTarSize(files: CustomFile[]): number {
    let total = 0;
    for (const f of files) {
        const path = f.customRelativePath ?? f.webkitRelativePath ?? f.name;
        // Standard 512-byte header
        total += 512;
        // PAX extended header if path > 100 chars, non-ASCII, or size >= 8 GiB
        if (path.length > 100 || /[^\x00-\x7F]/.test(path) || f.size >= 8589934592) {
            const paxPayloadLen = textEncoder.encode(`${path.length + 14} path=${path}\n`).length;
            total += 512 + Math.ceil(paxPayloadLen / 512) * 512;
        }
        // File payload padded to 512-byte boundary
        total += Math.ceil(f.size / 512) * 512;
    }
    // 1024-byte zero block EOF marker
    total += 1024;
    return total;
}

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

const INITIAL_FILE: SingleFile = {
    name: '',
    content: '',
    isTruncated: false,
    isText: true,
    isBinary: false,
    isFolder: false,
    size: 0,
};

export default function EditorPage() {
    const router = useRouter();

    const [file, setFile] = useState<SingleFile>(INITIAL_FILE);

    const [title, setTitle] = useState('');
    const [expiry, setExpiry] = useState('1 week');
    const [oneTime, setOneTime] = useState(false);
    const [encrypt, setEncrypt] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [acceptedWarning, setAcceptedWarning] = useState(false);

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
    const isEmpty = !file.content && !file.blob && !(file.files && file.files.length > 0) && !file.isFolder;
    const isDisabled = isOverUploadLimit || isEmpty || isProcessing;

    const handleReset = () => {
        setFile(INITIAL_FILE);
        // setTitle('');
        // setPassword('');
        // setEncrypt(false);
        // setOneTime(false);
        // setExpiry('1 week');
        setAcceptedWarning(false);

        if (fileInputRef.current) fileInputRef.current.value = '';
        if (folderInputRef.current) folderInputRef.current.value = '';
    };

    const handleFileUpload = async (rawFile: File) => {
        handleReset();

        const isBinary = isProbBinary(new Uint8Array(await rawFile.slice(0, MAX_SAFE_EDIT_BYTES).arrayBuffer()));
        const isTruncated = rawFile.size > MAX_SAFE_EDIT_BYTES;
        const isText = !isBinary && isTruncated;

        setFile({
            name: rawFile.name,
            content: await readFirst(rawFile, MAX_SAFE_EDIT_BYTES),
            isText,
            isTruncated,
            isBinary,
            isFolder: false,
            blob: rawFile,
            size: rawFile.size,
        });
        setTitle(rawFile.name);
    };

    const handleFolderUpload = (rawFiles: FileList) => {
        handleReset();

        const filesArray = Array.from(rawFiles) as CustomFile[];
        if (filesArray.length === 0) {
            alert('Cant upload empty folder');
            return;
        }

        const folderName = filesArray[0]!.webkitRelativePath.split('/')[0] ?? 'archive';
        const totalSize = filesArray.reduce((acc, f) => acc + f.size, 0);
        const archiveName = `${folderName}.${ARCHIVE_FORMAT}`;

        setFile({
            name: archiveName,
            content: '',
            isText: false,
            isBinary: true,
            isFolder: true,
            isTruncated: false,
            files: filesArray,
            size: totalSize,
        });
        setTitle(archiveName);
    };

    const isFileEntry = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;
    const isDirectoryEntry = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry => entry.isDirectory;

    const readAllEntries = async (dirReader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
        const entries: FileSystemEntry[] = [];
        while (true) {
            const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
                dirReader.readEntries(resolve, reject);
            });
            if (!batch || batch.length === 0) break;
            entries.push(...batch);
        }
        return entries;
    };

    const scanDirectory = async (entry: FileSystemEntry, basePath = ''): Promise<CustomFile[]> => {
        let files: CustomFile[] = [];
        const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;

        if (isFileEntry(entry)) {
            const f = (await new Promise<File>((resolve, reject) => {
                entry.file(resolve, reject);
            })) as CustomFile;

            f.customRelativePath = currentPath;
            try {
                Object.defineProperty(f, 'webkitRelativePath', {
                    value: currentPath,
                    writable: true,
                    configurable: true,
                });
            } catch {}

            files.push(f);
        } else if (isDirectoryEntry(entry)) {
            const reader = entry.createReader();
            const entries = await readAllEntries(reader);
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
            const archiveName = `${entry.name}.${ARCHIVE_FORMAT}`;

            setFile({
                name: archiveName,
                content: '',
                isText: false,
                isBinary: true,
                isFolder: true,
                isTruncated: false,
                files: scannedFiles,
                size: totalSize,
            });
            setTitle(archiveName);
            setIsProcessing(false);
        } else {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile) await handleFileUpload(droppedFile);
        }
    };

    const handlePaste = async () => {
        if (isOverUploadLimit) return;

        setIsProcessing(true);
        setStatusMessage('Preparing upload...');

        try {
            const uploadName = title.trim() || file.name;
            const exp = EXPIRY_OPTIONS[expiry]!;

            let uploadSource: File | Blob | ReadableStreamDefaultReader<Uint8Array>;
            let totalUploadSize: number;
            let fileType: string;

            if (file.isFolder && file.files && file.files.length > 0) {
                if (ARCHIVE_FORMAT === 'tar') {
                    setStatusMessage('Initializing TAR stream...');
                    totalUploadSize = estimateTarSize(file.files);

                    // Create streaming TAR packer
                    const { readable, controller } = createTarPacker();

                    // Prefix with `void` to satisfy ESLint floating-promise rule
                    void (async () => {
                        try {
                            for (const f of file.files!) {
                                const body = controller.add({
                                    name: f.customRelativePath ?? f.webkitRelativePath ?? f.name,
                                    size: f.size,
                                    mtime: new Date(f.lastModified),
                                });

                                const writer = body.getWriter();

                                for (let offset = 0; offset < f.size; offset += SLICE_SIZE) {
                                    const slice = f.slice(offset, Math.min(offset + SLICE_SIZE, f.size));
                                    const arrayBuffer = await slice.arrayBuffer();
                                    await writer.write(new Uint8Array(arrayBuffer));
                                }

                                await writer.close();
                            }
                            controller.finalize();
                        } catch (err) {
                            controller.error(err);
                        }
                    })();

                    const stream = readable as ReadableStream<Uint8Array>;
                    uploadSource = stream.getReader();
                    fileType = 'application/x-tar';
                } else {
                    setStatusMessage('Initializing ZIP stream...');
                    const filesToZip = file.files.map((f) => ({
                        name: f.customRelativePath ?? f.webkitRelativePath ?? f.name,
                        input: f,
                        lastModified: new Date(f.lastModified),
                        size: f.size,
                    }));

                    const predictedZipSize = Number(predictLength(filesToZip));
                    const zipResponse = downloadZip(filesToZip, { length: predictedZipSize });
                    if (!zipResponse.body) {
                        throw new Error('ReadableStream is not supported by your browser.');
                    }

                    uploadSource = zipResponse.body.getReader();
                    totalUploadSize = predictedZipSize;
                    fileType = 'application/zip';
                }
            } else if (file.isText) {
                uploadSource = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
                totalUploadSize = uploadSource.size;
                fileType = 'text/plain;charset=utf-8';
            } else if (file.blob) {
                uploadSource = file.blob;
                totalUploadSize = file.blob.size;
                fileType = file.blob.type || 'application/octet-stream';
            } else {
                throw new Error('No file payload found.');
            }

            await new Promise<void>((resolve, reject) => {
                let pasteId = '';
                let pasteToken = '';
                let lastProgressUpdate = 0;

                const upload = new tus.Upload(uploadSource, {
                    endpoint: `${URL}/api/upload`,
                    retryDelays: [0, 1000, 3000, 5000],
                    chunkSize: UPLOAD_CHUNK_SIZE,
                    uploadSize: totalUploadSize,
                    storeFingerprintForResuming: false,
                    removeFingerprintOnSuccess: true,
                    metadata: {
                        json: JSON.stringify({
                            filename: uploadName,
                            filetype: fileType,
                            expiry: exp === -1 ? -1 : Date.now() + exp * 1000,
                            oneTime,
                            password: !encrypt ? '' : (password ?? ''),
                        }),
                    },
                    onError: (error) => {
                        if ('cancel' in uploadSource && typeof uploadSource.cancel === 'function') {
                            uploadSource.cancel().catch(() => ({}));
                        }
                        reject(error);
                    },
                    onProgress: (bytesUploaded, bytesTotal) => {
                        const now = performance.now();
                        // throttle to 500ms to prevent ui load
                        if (now - lastProgressUpdate > 500 || bytesUploaded === bytesTotal) {
                            lastProgressUpdate = now;
                            const pct = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
                            setStatusMessage(`Uploading... ${formatSize(bytesUploaded)} / ${formatSize(bytesTotal)} (${pct}%)`);
                        }
                    },
                    onAfterResponse(_req, res) {
                        pasteId = res.getHeader('X-Paste-Id') ?? res.getHeader('x-paste-id') ?? '';
                        pasteToken = res.getHeader('X-Paste-Token') ?? res.getHeader('x-paste-token') ?? '';
                    },
                    onSuccess: () => {
                        resolve();
                        router.push(`/${encodeURIComponent(pasteId)}?t=${encodeURIComponent(pasteToken)}`);
                    },
                });

                upload.start();
            });

            // this just flashes (ugly)
            // setStatusMessage('Upload complete!');
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setIsProcessing(false);
            setStatusMessage('');
        } /* finally {
            setIsProcessing(false);
            setStatusMessage('');
        } */
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
                    if (e.target.files?.[0]) await handleFileUpload(e.target.files[0]);
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
                        isBinary={file.isBinary}
                        isTruncated={file.isTruncated}
                        totalSize={stats.bytes}
                        isFolder={file.isFolder}
                        acceptedWarning={acceptedWarning}
                        onAcceptedWarning={() => setAcceptedWarning(true)}
                        placeholder="paste, type, or drop a file or folder here ..."
                        // TODO: maybe allow edit on truncated files
                        mode={file.isTruncated ? 'view' : 'edit'}
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
                                    <span>Folder ({ARCHIVE_FORMAT.toUpperCase()})</span>
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
                            disabled={isDisabled}
                            onClick={handlePaste}
                            className={`w-full py-2.5 text-sm font-bold tracking-wider transition-all duration-150 border ${
                                isOverUploadLimit
                                    ? 'bg-[#1b212b] text-rose-400 border-rose-500/20 cursor-not-allowed'
                                    : isEmpty
                                      ? 'bg-[#14181f] text-[#484f58] border-[#1b212b] cursor-not-allowed select-none'
                                      : 'bg-[#00d2d3] hover:bg-[#00e5ff] text-black shadow-lg shadow-cyan-500/10 active:scale-[0.99] cursor-pointer'
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
