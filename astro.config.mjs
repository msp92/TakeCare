// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

/** Pre-bundle SSR/workerd deps in one pass so lazy discovery does not reload mid-render. */
const SERVER_OPTIMIZE_DEPS = [
  "react",
  "react-dom",
  "react-dom/server.edge",
  "react-dom/client",
  "react/jsx-runtime",
  "@radix-ui/react-slot",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
];

/** Virtual Astro modules must not be optimized (avoids astro_env_runtime reload errors). */
const SERVER_OPTIMIZE_EXCLUDE = ["astro:env", "astro:env/server", "astro/env/runtime"];

/** @astrojs/cloudflare uses a separate SSR Vite environment; vite.ssr.optimizeDeps is ignored. */
function optimizeServerDeps() {
  return {
    name: "optimize-server-deps",
    /** @param {string} name */
    configEnvironment(name) {
      if (name !== "client") {
        return {
          optimizeDeps: {
            include: SERVER_OPTIMIZE_DEPS,
            exclude: SERVER_OPTIMIZE_EXCLUDE,
          },
        };
      }
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: "https://takecare.msp92.workers.dev",
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    assetsInclude: ["**/*.wasm"],
    plugins: [tailwindcss(), optimizeServerDeps()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: { "react-dom/server": "react-dom/server.edge" },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "pdfjs-dist/legacy/build/pdf.mjs"],
    },
    ssr: {
      // pdfjs-dist is client-only (Phase 1b); avoid SSR/workerd evaluating it
      external: ["pdfjs-dist"],
    },
  },
  adapter: cloudflare(),
  // Supabase handles auth; disable Astro default Cloudflare KV session binding
  session: { driver: { entrypoint: "unstorage/drivers/null" } },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
