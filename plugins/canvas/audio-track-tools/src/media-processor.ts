import { buildMergeCommand, buildMergeTranscodeCommand, buildSplitCommand } from "./media-plan";

export type FfmpegLike = {
    writeFile: (path: string, data: Uint8Array) => Promise<unknown>;
    exec: (args: string[]) => Promise<number>;
    readFile: (path: string) => Promise<Uint8Array | string>;
    deleteFile: (path: string) => Promise<unknown>;
};

export async function splitMedia(ffmpeg: FfmpegLike, input: Blob) {
    const files = ["input.mp4", "silent.mp4", "audio.m4a"];
    try {
        await ffmpeg.writeFile("input.mp4", new Uint8Array(await input.arrayBuffer()));
        const code = await ffmpeg.exec(buildSplitCommand());
        if (code !== 0) throw new Error("视频音轨分离失败，请确认输入视频包含可读取的音轨");
        const [video, audio] = await Promise.all([readOutput(ffmpeg, "silent.mp4", "video/mp4"), readOutput(ffmpeg, "audio.m4a", "audio/mp4")]);
        return { video, audio };
    } finally {
        await cleanup(ffmpeg, files);
    }
}

export async function mergeMedia(ffmpeg: FfmpegLike, video: Blob, audio: Blob) {
    const files = ["video.mp4", "audio.m4a", "output.mp4"];
    try {
        await Promise.all([
            ffmpeg.writeFile("video.mp4", new Uint8Array(await video.arrayBuffer())),
            ffmpeg.writeFile("audio.m4a", new Uint8Array(await audio.arrayBuffer())),
        ]);
        let code = await ffmpeg.exec(buildMergeCommand());
        if (code !== 0) {
            await ffmpeg.deleteFile("output.mp4").catch(() => undefined);
            code = await ffmpeg.exec(buildMergeTranscodeCommand());
        }
        if (code !== 0) throw new Error("视频与音轨合并失败，请确认素材格式可用");
        return await readOutput(ffmpeg, "output.mp4", "video/mp4");
    } finally {
        await cleanup(ffmpeg, files);
    }
}

async function readOutput(ffmpeg: FfmpegLike, path: string, type: string) {
    const data = await ffmpeg.readFile(path);
    if (typeof data === "string") throw new Error("FFmpeg 返回了无效媒体数据");
    return new Blob([new Uint8Array(data)], { type });
}

async function cleanup(ffmpeg: FfmpegLike, paths: string[]) {
    await Promise.all(paths.map((path) => ffmpeg.deleteFile(path).catch(() => undefined)));
}
