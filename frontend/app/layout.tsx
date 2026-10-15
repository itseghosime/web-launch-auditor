import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Web Launch Auditor", description: "Audit a public site before launch — metadata, document structure, accessibility signals and internal link coverage." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
