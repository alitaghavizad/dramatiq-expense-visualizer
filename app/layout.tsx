import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN?.split(",")[0] ?? "http://localhost:3000"),
  title: "Dramatiq · Yerevan expense book",
  description: "Capture Armenian receipts, understand your spending, and explore it with a Claude-powered expense agent.",
  openGraph: {
    title: "Dramatiq · Your spending, clearly.",
    description: "Receipt intelligence and a Claude-powered expense chat for your private ledger.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Dramatiq expense intelligence and Claude-powered chat" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dramatiq · Your spending, clearly.",
    description: "Receipt intelligence and a Claude-powered expense chat for your private ledger.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
