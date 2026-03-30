import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#D4AF37",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "H&D Vision - Catálogo de Gafas",
  description: "Catálogo profesional de gafas.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "H&D Vision" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: '#000', color: '#FFF', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
