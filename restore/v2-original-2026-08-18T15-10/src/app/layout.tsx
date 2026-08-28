import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import "./globals.css";

const display = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Compass Draw",
  description: "Live compass draw tournament scoring & display",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body bg-court-bg text-white min-h-screen">{children}</body>
    </html>
  );
}
