import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { APP_NAME } from "../lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Nepali legal research`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Research Nepali law with answers grounded in published statutes and cited to the sections they rely on.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111a2b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
