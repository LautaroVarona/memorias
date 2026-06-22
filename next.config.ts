import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    middlewareClientMaxBodySize: "100mb",
  },
  // Evita EPERM/ENOENT en la caché de webpack bajo Windows con hot-reload
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.cache = false;
    }
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve("buffer/"),
        fs: false,
        path: false,
        stream: false,
      };
    }
    return config;
  },
};

export default nextConfig;
