import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components choca con useParams en rutas de chest; lo apagamos para el MVP.
  cacheComponents: false,
  async redirects() {
    return [
      { source: "/entrar", destination: "/enter", permanent: true },
      { source: "/ataque", destination: "/attack", permanent: true },
      { source: "/crear", destination: "/create", permanent: true },
      { source: "/cofre/:id", destination: "/chest/:id", permanent: true },
      {
        source: "/cofre/:id/probando",
        destination: "/chest/:id/proving",
        permanent: true,
      },
      {
        source: "/cofre/:id/abierto",
        destination: "/chest/:id/claimed",
        permanent: true,
      },
      {
        source: "/chest/:id/opened",
        destination: "/chest/:id/claimed",
        permanent: true,
      },
      {
        source: "/cofre/:id/error",
        destination: "/chest/:id/error",
        permanent: true,
      },
      { source: "/panel", destination: "/dashboard", permanent: true },
    ];
  },
  serverExternalPackages: [
    "chestzk-chest",
    "snarkjs",
    "circomlibjs",
    "passkey-kit",
  ],
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
