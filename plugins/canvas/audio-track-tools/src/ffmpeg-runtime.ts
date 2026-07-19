import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

import type { FfmpegLike } from "./media-processor";

let ffmpegPromise: Promise<FFmpeg> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function runWithFfmpeg<T>(task: (ffmpeg: FfmpegLike) => Promise<T>, onProgress: (progress: number) => void) {
    const run = queue.then(async () => {
        const ffmpeg = await loadFfmpeg();
        const progressHandler = ({ progress }: { progress: number }) => onProgress(Math.max(0, Math.min(1, progress || 0)));
        ffmpeg.on("progress", progressHandler);
        try {
            return await task(ffmpeg);
        } finally {
            ffmpeg.off("progress", progressHandler);
        }
    });
    queue = run.then(() => undefined, () => undefined);
    return run;
}

async function loadFfmpeg() {
    if (!ffmpegPromise) {
        ffmpegPromise = (async () => {
            const ffmpeg = new FFmpeg();
            const assetBase = new URL("/plugins/audio-track-tools/", globalThis.location.origin);
            const [classWorkerURL, coreURL, wasmURL] = await Promise.all([
                toBlobURL(new URL("ffmpeg-worker.js", assetBase).href, "text/javascript"),
                toBlobURL(new URL("ffmpeg-core.js", assetBase).href, "text/javascript"),
                toBlobURL(new URL("ffmpeg-core.wasm", assetBase).href, "application/wasm"),
            ]);
            await ffmpeg.load({ classWorkerURL, coreURL, wasmURL });
            return ffmpeg;
        })().catch((error) => {
            ffmpegPromise = null;
            throw error;
        });
    }
    return ffmpegPromise;
}
