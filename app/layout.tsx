import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";
import PlayerProvider from "@/components/player/PlayerProvider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import PlayerBar from "@/components/player/PlayerBar";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import MobileLyricsOverlay from "@/components/player/MobileLyricsOverlay";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orpheus",
  description: "A music library for your personal collection",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Orpheus",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0B" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://www.youtube.com" />
        <link rel="preconnect" href="https://www.google.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegister />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PlayerProvider>
            {children}
            <Toaster richColors position="bottom-right" />
            <MobileLyricsOverlay />
            <PlayerBar />
          </PlayerProvider>
        </ThemeProvider>
        <MobileLyricsOverlay />
      </body>
    </html>
  );
}
