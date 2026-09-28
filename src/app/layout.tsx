import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "The Breakfast Club", template: "%s · The Breakfast Club" },
  description: "Membership dues for The Breakfast Club.",
  applicationName: "Breakfast Club",
  appleWebApp: { capable: true, title: "Breakfast Club", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1c1917",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
