import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Web Launch Auditor — Launch with clarity", description: "Check your website, prioritize findings, and keep your launch moving." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
