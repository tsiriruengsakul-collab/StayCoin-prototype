import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { brand } from "./src/brand";

export default defineConfig({
  build: { rollupOptions: { output: { manualChunks: { ethers: ["ethers"] } } } },
  plugins: [
    react(),
    tailwindcss(),
    { name: "website-title", transformIndexHtml: () => [
      { tag: "title", children: brand.websiteName, injectTo: "head" },
      { tag: "meta", attrs: { property: "og:site_name", content: brand.websiteName }, injectTo: "head" },
    ] },
  ],
});
