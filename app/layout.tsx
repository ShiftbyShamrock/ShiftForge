import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SHIFT — The Forge',
  description: 'Transform your NFTs into playable SHIFT cards. The Forge creates heroes, monsters, artifacts, and SHIFT spells from any NFT collection on Solana.',
  keywords: ['SHIFT', 'NFT', 'card game', 'TCG', 'Solana', 'forge', 'trading cards'],
  openGraph: {
    title: 'SHIFT — The Forge',
    description: 'Transform your NFTs into playable SHIFT cards.',
    url: 'https://shiftforge.io',
    siteName: 'SHIFT Forge',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
