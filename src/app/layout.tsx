import '~/styles/globals.css';
import { type Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import Providers from './providers';

export const metadata: Metadata = {
    title: 'upi-paste',
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={GeistSans.variable}>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
