import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CasaKeeper · Your home, organized.",
  description: "A shared household workspace for the things that keep home running.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
