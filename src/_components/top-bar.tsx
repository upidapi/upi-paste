'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home } from 'lucide-react';

interface TopBarProps {
    showExpiry?: boolean;
    filename?: string;
    expiresAt?: Date | string | number | null;
    children?: React.ReactNode;
}

function formatTimeRemaining(target: Date | string | number): string {
    const end = new Date(target).getTime();
    const diff = Math.max(0, Math.floor((end - Date.now()) / 1000));

    if (diff <= 0) return 'expired';

    const weeks = Math.floor(diff / (7 * 24 * 3600));
    let rem = diff % (7 * 24 * 3600);

    const days = Math.floor(rem / (24 * 3600));
    rem %= 24 * 3600;

    const hours = Math.floor(rem / 3600);
    rem %= 3600;

    const mins = Math.floor(rem / 60);
    const secs = rem % 60;

    const parts: string[] = [];
    if (weeks > 0) parts.push(`${weeks} ${weeks === 1 ? 'week' : 'weeks'}`);
    if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'min' : 'mins'}`);
    parts.push(`${secs} ${secs === 1 ? 'sec' : 'secs'}`);

    return `expires in ${parts.join(', ')}`;
}

export default function TopBar({ filename, showExpiry = false, expiresAt, children }: TopBarProps) {
    const [countdown, setCountdown] = useState<string>('');

    useEffect(() => {
        if (!showExpiry || !expiresAt) {
            setCountdown('');
            return;
        }

        const update = () => {
            setCountdown(formatTimeRemaining(expiresAt));
        };

        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [showExpiry, expiresAt]);

    return (
        <header className="relative h-10 w-full bg-[#0e1116] border-b border-[#1b212b] px-3.5 flex items-center justify-between select-none text-xs font-mono">
            <div className="flex items-center gap-3">
                <Link href="/" title="Home" className="text-[#8b949e] hover:text-[#00d2d3] transition-colors flex items-center justify-center p-1 rounded">
                    <Home size={16} />
                </Link>

                {showExpiry && countdown && <span className="text-[#8b949e] font-mono tracking-tight">{countdown}</span>}
            </div>

            {filename && (
                <span className="absolute left-1/2 -translate-x-1/2 max-w-[50%] truncate text-[#8b949e] font-mono tracking-tight">
                    {filename}
                </span>
            )}

            {children && <div className="flex items-center gap-1.5 text-[#8b949e]">{children}</div>}
        </header>
    );
}
