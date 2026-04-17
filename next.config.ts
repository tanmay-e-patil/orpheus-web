import withPWAInit from "next-pwa";

const isDev = process.env.NODE_ENV === "development";
const enablePWAInDev =
  process.env.NEXT_PWA_ENABLE === "1" || process.env.NEXT_PWA_ENABLE === "true";

// Runtime caching strategies using Workbox routing
const runtimeCaching = [
  // Cache images (album art, YouTube thumbs)
  {
    urlPattern:
      /^https?:\/\/(i\.scdn\.co|i\.ytimg\.com|img\.youtube\.com|e-cdns-images\.dzcdn\.net|cdns-images\.dzcdn\.net)\/.*/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "remote-images",
      expiration: {
        maxEntries: 200,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
  // Static resources
  {
    urlPattern: ({ request }: { request: Request }) =>
      ["style", "script", "worker", "font"].includes(
        (request as any).destination
      ),
    handler: "StaleWhileRevalidate",
    options: { cacheName: "static-resources" },
  },
  // App shell / navigations
  {
    urlPattern: ({ request }: { request: Request }) =>
      request.mode === "navigate",
    handler: "NetworkFirst",
    options: {
      cacheName: "pages",
      expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
  // Our client API routes (lyrics, etc.)
  {
    urlPattern: ({ url }: { url: URL }) =>
      url.pathname.startsWith("/api/lyrics/"),
    handler: "NetworkFirst",
    method: "GET",
    options: {
      cacheName: "api-lyrics",
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 50, maxAgeSeconds: 60 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
];

const withPWA = withPWAInit({
  dest: "public",
  // Allow opt-in PWA during `next dev` by setting NEXT_PWA_ENABLE=1
  disable: isDev && !enablePWAInDev,
  register: false, // we manually register via a client component
  skipWaiting: true,
  runtimeCaching,
  buildExcludes: [/middleware-manifest\.json$/],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co", pathname: "**" },
      { protocol: "https", hostname: "i.ytimg.com", pathname: "**" },
      { protocol: "https", hostname: "img.youtube.com", pathname: "**" },
      { protocol: "https", hostname: "e-cdns-images.dzcdn.net", pathname: "**" },
      { protocol: "https", hostname: "cdns-images.dzcdn.net", pathname: "**" },
    ],
  },
};

export default withPWA(nextConfig);
