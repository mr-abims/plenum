import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { SessionProvider } from "@/lib/session";
import { Header } from "@/components/Header";
import "./globals.css";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans-face" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display-face" });

export const metadata: Metadata = {
  title: "Plenum",
  description: "An AI money manager for groups, bound by the group's rules. Monad testnet.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <SessionProvider>
            <Header />
            <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">{children}</main>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
