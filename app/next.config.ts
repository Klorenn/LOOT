import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components choca con useParams en rutas de cofre; lo apagamos para el MVP.
  cacheComponents: false,
  serverExternalPackages: ["chestzk-chest", "snarkjs", "circomlibjs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      stream: false,
    };
    return config;
  },
};

export default nextConfig;
