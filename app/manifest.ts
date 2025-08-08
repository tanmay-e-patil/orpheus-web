import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orpheus",
    short_name: "Orpheus",
    description: "A music library for your personal collection",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0B0B0B",
    theme_color: "#0B0B0B",
    orientation: "portrait-primary",
    categories: ["music", "audio", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      { name: "Home", url: "/home" },
      { name: "Search", url: "/search" },
    ],
  };
}
