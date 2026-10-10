import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import sitemap from "vite-plugin-sitemap";
import process from "node:process";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [
      react(),
      tailwindcss(),
      sitemap({
        hostname: env.VITE_HOST_NAME || 'https://deeptranslate.io',
        exclude: ['/admin', '/admin/*'],
        dynamicRoutes: [
          "/",
          "/about",
          "/library",
          "/feedback",
          "/privacy-policy",
          "/terms",
          "/support",
        ],
      }),
    ],
    resolve: {
      alias: {
        // Allows: import Foo from '@/components/Foo'
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
