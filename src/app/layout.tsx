import '~/styles/globals.css';
import { type Metadata } from 'next';
import { Geist } from 'next/font/google';
import Providers from './providers'; // adjust the import path as needed

export const metadata: Metadata = {
    title: 'upi-paste',
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
};

const geist = Geist({
    subsets: ['latin'],
    variable: '--font-geist-sans',
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={`${geist.variable}`}>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
