import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CasaKeeper · Your home, organized.",
  description: "A shared household workspace for the things that keep home running.",
  applicationName: "CasaKeeper",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "CasaKeeper",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2479ED",
};

const themeInitializer = `try { var theme = localStorage.getItem("casakeeper-theme"); if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme; } catch (error) {}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitializer }} /></head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
