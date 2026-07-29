import { defineConfig } from "vite";

export default defineConfig({
    base: "./",
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        target: "esnext",
        sourcemap: true,
    },
    // .wgsl imported via ?raw
    assetsInclude: ["**/*.hdr", "**/*.env"],
});
