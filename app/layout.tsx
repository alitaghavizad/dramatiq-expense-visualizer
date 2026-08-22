import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { I18nProvider } from "./i18n/provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const preferenceBootstrap = `(() => {
  const themeStorageKey = "dramatiq-theme";
  let theme = null;
  try {
    const stored = window.localStorage.getItem(themeStorageKey);
    if (stored === "light" || stored === "dark") theme = stored;
  } catch {}
  if (!theme) theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const localeStorageKey = "dramatiq-locale";
  const allowedLocales = ["en", "hy", "de"];
  let locale = null;
  try {
    const stored = window.localStorage.getItem(localeStorageKey);
    if (allowedLocales.includes(stored)) locale = stored;
  } catch {}
  if (!locale) {
    const browserLocale = window.navigator.language.toLowerCase();
    locale = allowedLocales.find((candidate) => browserLocale.startsWith(candidate)) || "en";
  }
  document.documentElement.dataset.locale = locale;
  document.documentElement.lang = locale;
  document.documentElement.dir = "ltr";
})();`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferenceBootstrap }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}><I18nProvider>{children}</I18nProvider></body>
    </html>
  );
}
