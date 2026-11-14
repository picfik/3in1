import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "日常管理台",
        short_name: "日常管理",
        description: "现金流、日记与健康记录",
        lang: "zh-CN",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#f2f3ee",
        theme_color: "#f2f3ee",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
        ]
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"]
      }
    })
  ],
  build: { target: "es2022" }
});