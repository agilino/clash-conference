import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The header reads the Settings record on every render (components/app-header.tsx).
// Without this the build prerenders every screen with the event name it found at
// build time, so a save — or a db:reset — would leave a stale header behind.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "clash-conference",
  description:
    "Manage the programme of one event and publish each talk to CLASH.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
