import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { SessionProvider } from "@/lib/session";
import { Header } from "@/components/Header";
import { MotionProvider } from "@/components/MotionProvider";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-bricolage" });

export const metadata: Metadata = {
  title: "Plenum",
  description: "An AI money manager for groups, bound by the group's rules. Monad testnet.",
};

export const viewport: Viewport = {
  themeColor: "#0c0e0d",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="grain min-h-dvh">
        <NextIntlClientProvider>
          <SessionProvider>
            <MotionProvider>
              <Header />
              <main className="mx-auto w-full max-w-7xl px-4 pb-28 sm:px-6 lg:px-8">{children}</main>
            </MotionProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
