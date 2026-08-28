import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Matches UXSAMPLE/SERPL_Budget_Portal_Demo.html's typography exactly (see CLAUDE.md §3).
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SERPL Budget Management Portal",
  description: "IOCL South Eastern Region Pipelines — R&M budget preparation, approval, and monitoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">{children}</body>
    </html>
  );
}
