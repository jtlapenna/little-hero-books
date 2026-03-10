import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ConditionalNavigation } from '@/components/ui/conditional-navigation';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Asset Review System - Little Hero Labs',
  description: 'Human-in-the-loop asset review system for personalized children\'s books',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No-op deployment marker for Cloudflare Pages verification.
  return (
    <html lang="en">
      <body className={inter.className}>
        <ConditionalNavigation />
        {children}
      </body>
    </html>
  );
}
