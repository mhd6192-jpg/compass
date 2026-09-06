import type { Metadata, Viewport } from "next";
import { Oswald, Inter } from "next/font/google";
import "./globals.css";
import ServiceWorker from "@/components/shared/ServiceWorker";

const display = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Compass Draw",
  description: "Live compass draw tournament scoring & display",

  // Linking the manifest is what makes the browser offer to install the app.
  // It had been sitting in public/ unreferenced, so nothing ever did.
  manifest: "/manifest.webmanifest",

  // iOS ignores the manifest almost entirely: it takes the standalone flag, the
  // title and the icon from these meta tags instead, and from nowhere else.
  appleWebApp: {
    capable: true,
    title: "Compass",
    // Lets the app paint under the status bar, which is what `viewportFit:
    // "cover"` below is for. Anything pinned to an edge needs the safe-area
    // padding in globals.css to stay clear of the notch and home indicator.
    statusBarStyle: "black-translucent",
  },

  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // Matches the manifest's background, so the status bar and the area behind a
  // notch are the court background rather than white.
  themeColor: "#040906",
  width: "device-width",
  initialScale: 1,
  // Paint into the notch and the home indicator area on iPhones. The
  // `.safe-top` / `.safe-bottom` helpers keep controls out of both.
  viewportFit: "cover",

  // Zoom is deliberately left enabled. Disabling it is the usual reflex for an
  // app that felt "jumpy" on iOS, but the jump was Safari zooming into fields
  // under 16px — fixed properly in globals.css — and taking pinch-zoom away
  // from somebody reading a small score in bright sun is not a trade worth
  // making.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body bg-court-bg text-white min-h-screen">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
