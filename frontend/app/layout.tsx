import type { Metadata } from "next";
import { JetBrains_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Web Launch Auditor — Pre-Flight Mission Control",
  description: "Strap your URL into the wind tunnel before the internet finds your broken links.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
