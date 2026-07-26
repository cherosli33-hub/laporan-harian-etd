import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  return {
    title: "Laporan Harian ETD – Hospital Kuala Lipis",
    description: "PWA mobile-first untuk laporan syif harian E.T.D Hospital Kuala Lipis.",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Laporan ETD" },
    openGraph: { title: "Laporan Harian ETD", description: "E.T.D Hospital Kuala Lipis", images: [{ url: imageUrl, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Laporan Harian ETD", description: "E.T.D Hospital Kuala Lipis", images: [imageUrl] },
  };
}
export const viewport: Viewport = { themeColor: "#075b45", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ms"><body className={geist.variable}>{children}</body></html>; }
