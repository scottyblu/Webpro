import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Room for the firehouse logo upload (Settings), which sends a few resized copies of the image.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Shown on /setup-check so you can tell when a redeploy has gone live.
  env: { BUILD_TIME: new Date().toISOString() },
  async headers() {
    return [
      {
        // The service worker must always be re-checked so app updates reach installed phones.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
