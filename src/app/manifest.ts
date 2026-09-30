import type { MetadataRoute } from "next";

/**
 * Web app manifest: lets members and admins install the club as an app on their phone.
 * Icons come from /club-logo (the firehouse logo from Settings, or the default icon).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "The Breakfast Club",
    short_name: "Breakfast Club",
    description: "Pay your membership dues and see who has paid.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1c1917",
    theme_color: "#1c1917",
    categories: ["finance", "lifestyle"],
    icons: [
      { src: "/club-logo/icon192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/club-logo/icon512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/club-logo/maskable512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My Membership", url: "/dashboard", icons: [{ src: "/club-logo/icon192", sizes: "192x192" }] },
      { name: "Admin Dashboard", url: "/admin", icons: [{ src: "/club-logo/icon192", sizes: "192x192" }] },
    ],
  };
}
