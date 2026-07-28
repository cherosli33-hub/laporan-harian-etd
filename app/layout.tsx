import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://laporan-harian-etd-klipis.pakdo.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Laporan Harian ETD – Hospital Kuala Lipis",
  description:
    "PWA mobile-first untuk laporan syif harian E.T.D Hospital Kuala Lipis.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/etd-logo.jpg", apple: "/etd-logo.jpg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Laporan ETD",
  },
  openGraph: {
    title: "Laporan Harian ETD",
    description: "E.T.D Hospital Kuala Lipis",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Laporan Harian ETD",
    description: "E.T.D Hospital Kuala Lipis",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#075b45",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ms">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
