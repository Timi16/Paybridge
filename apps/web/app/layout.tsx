import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.usepaybridge.xyz").replace(/\/$/, "");
const DESCRIPTION = "Run payroll in USDC on Stellar Testnet. Sign once, pay everyone, keep every transaction hash.";

// The share card (opengraph-image.png, twitter-image.png) and apple-icon.png in this folder are
// picked up by Next.js automatically; metadataBase makes their URLs absolute for link previews.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "PayBridge", template: "%s · PayBridge" },
  description: DESCRIPTION,
  applicationName: "PayBridge",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }] },
  openGraph: {
    type: "website",
    siteName: "PayBridge",
    title: "PayBridge · Pay everyone. Sign once.",
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image", title: "PayBridge · Pay everyone. Sign once.", description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0F6B4B" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
