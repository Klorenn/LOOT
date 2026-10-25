import path from "node:path";
import type { NextConfig } from "next";

// Hay un package-lock.json en $HOME: sin root explícito Turbopack vigila todo el
// home y recarga en loop. Fijamos el root del monorepo (app importa ../packages).
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  // Cache Components choca con useParams en rutas de chest; lo apagamos para el MVP.
  cacheComponents: false,
  async redirects() {
    return [
      { source: "/entrar", destination: "/enter", permanent: true },
      { source: "/ataque", destination: "/attack", permanent: true },
      { source: "/crear", destination: "/create", permanent: true },
      { source: "/cofre/:id", destination: "/chest/:id", permanent: true },
      { source: "/cofre/:id/probando", destination: "/chest/:id", permanent: true },
      // La prueba ahora corre inline en /chest/:id (panel 03).
      { source: "/chest/:id/proving", destination: "/chest/:id", permanent: true },
      { source: "/chest/:id/error", destination: "/chest/:id", permanent: true },
      {
        source: "/cofre/:id/abierto",
        destination: "/chest/:id/claimed",
        permanent: true,
      },
      { source: "/chest/:id/opened", destination: "/chest/:id", permanent: true },
      { source: "/cofre/:id/error", destination: "/chest/:id", permanent: true },
      { source: "/panel", destination: "/dashboard", permanent: true },
      { source: "/enter", destination: "/login", permanent: false },
      { source: "/wallet", destination: "/profile", permanent: false },
    ];
  },
  serverExternalPackages: [
    "@findloot/chest",
    "snarkjs",
    "circomlibjs",
    "passkey-kit",
  ],
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
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
