import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPlugin } from "@infinite-canvas/plugin-sdk/build";

const root = dirname(fileURLToPath(import.meta.url));
const distAssets = join(root, "dist", "audio-track-tools");
const publicAssets = join(root, "..", "..", "..", "web", "public", "plugins", "audio-track-tools");

await buildPlugin(import.meta.url);
await mkdir(distAssets, { recursive: true });
await build({
    entryPoints: [join(root, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm", "worker.js")],
    outfile: join(distAssets, "ffmpeg-worker.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
});
await Promise.all([
    cp(join(root, "node_modules", "@ffmpeg", "core", "dist", "esm", "ffmpeg-core.js"), join(distAssets, "ffmpeg-core.js")),
    cp(join(root, "node_modules", "@ffmpeg", "core", "dist", "esm", "ffmpeg-core.wasm"), join(distAssets, "ffmpeg-core.wasm")),
]);
await mkdir(publicAssets, { recursive: true });
await cp(distAssets, publicAssets, { recursive: true });
console.log("[audio-track-tools] synced FFmpeg worker/core assets");
