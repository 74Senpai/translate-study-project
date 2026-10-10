import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  base: "/admin/",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Required for SPA routing under /admin/* subpath in dev mode.
    // Without this, reloading /admin/library returns 404 from the Vite dev server.
    historyApiFallback: {
      rewrites: [
        { from: /^\/admin\/.*/, to: "/admin/index.html" },
      ],
    },
  },
});
