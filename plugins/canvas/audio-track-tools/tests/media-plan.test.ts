import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildMergeCommand, buildMergeTranscodeCommand, buildSplitCommand, selectMergeInputs, selectSplitInput } from "../src/media-plan";
import { mergeMedia, splitMedia } from "../src/media-processor";
import { buildOutputOps } from "../src/output-nodes";

const video = { id: "video-1", type: "video", metadata: { content: "blob:video", mimeType: "video/mp4" } };
const audio = { id: "audio-1", type: "audio", metadata: { content: "blob:audio", mimeType: "audio/mpeg" } };

test("split input requires exactly one readable video", () => {
    assert.equal(selectSplitInput([video]).id, "video-1");
    assert.throws(() => selectSplitInput([]), /需要连接 1 个视频节点/);
    assert.throws(() => selectSplitInput([video, { ...video, id: "video-2" }]), /只能连接 1 个视频节点/);
});

test("merge input requires one video and one audio", () => {
    assert.deepEqual(selectMergeInputs([video, audio]), { video, audio });
    assert.throws(() => selectMergeInputs([video]), /需要连接 1 个音频节点/);
    assert.throws(() => selectMergeInputs([video, audio, { ...audio, id: "audio-2" }]), /只能连接 1 个音频节点/);
});

test("split command copies video without audio and extracts AAC", () => {
    assert.deepEqual(buildSplitCommand(), [
        "-i", "input.mp4",
        "-map", "0:v:0", "-c:v", "copy", "-an", "silent.mp4",
        "-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", "192k", "audio.m4a",
    ]);
});

test("merge command keeps video duration and pads or trims audio", () => {
    assert.deepEqual(buildMergeCommand(), [
        "-i", "video.mp4", "-i", "audio.m4a",
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-af", "apad", "-c:a", "aac", "-b:a", "192k",
        "-shortest", "output.mp4",
    ]);
});

test("merge fallback transcodes incompatible video to H264", () => {
    assert.deepEqual(buildMergeTranscodeCommand(), [
        "-i", "video.mp4", "-i", "audio.m4a",
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
        "-af", "apad", "-c:a", "aac", "-b:a", "192k",
        "-shortest", "output.mp4",
    ]);
});

test("split processor returns video and audio blobs and cleans temporary files", async () => {
    const ffmpeg = new FakeFfmpeg({ "silent.mp4": [1, 2], "audio.m4a": [3, 4] });
    const result = await splitMedia(ffmpeg, new Blob(["input"], { type: "video/mp4" }));

    assert.equal(result.video.type, "video/mp4");
    assert.equal(result.audio.type, "audio/mp4");
    assert.deepEqual(ffmpeg.deleted.sort(), ["audio.m4a", "input.mp4", "silent.mp4"]);
});

test("merge processor returns an MP4 blob and cleans temporary files", async () => {
    const ffmpeg = new FakeFfmpeg({ "output.mp4": [5, 6] });
    const result = await mergeMedia(ffmpeg, new Blob(["video"]), new Blob(["audio"]));

    assert.equal(result.type, "video/mp4");
    assert.deepEqual(ffmpeg.deleted.sort(), ["audio.m4a", "output.mp4", "video.mp4"]);
});

test("merge processor retries with H264 when stream copy is incompatible", async () => {
    const ffmpeg = new FakeFfmpeg({ "output.mp4": [7, 8] }, [1, 0]);
    await mergeMedia(ffmpeg, new Blob(["video"]), new Blob(["audio"]));

    assert.equal(ffmpeg.commands.length, 2);
    assert.equal(ffmpeg.commands[1].includes("libx264"), true);
});

test("output node plan creates and connects a missing result", () => {
    const ops = buildOutputOps({
        processor: { id: "processor", position: { x: 10, y: 20 }, width: 280, height: 170 },
        outputId: "result",
        nodeType: "video",
        title: "无音轨视频",
        media: { url: "blob:result", storageKey: "plugin:1", bytes: 10, mimeType: "video/mp4", width: 1280, height: 720, durationMs: 1000 },
        exists: false,
        connected: false,
        yOffset: 0,
    });

    assert.equal(ops[0].type, "add_node");
    assert.equal(ops[1].type, "connect_nodes");
});

test("output node plan updates an existing connected result", () => {
    const ops = buildOutputOps({
        processor: { id: "processor", position: { x: 10, y: 20 }, width: 280, height: 170 },
        outputId: "result",
        nodeType: "audio",
        title: "提取音轨",
        media: { url: "blob:result", storageKey: "plugin:1", bytes: 10, mimeType: "audio/mp4" },
        exists: true,
        connected: true,
        yOffset: 210,
    });

    assert.deepEqual(ops.map((op) => op.type), ["update_node"]);
});

test("processor surface keeps canvas drag events while action button isolates clicks", async () => {
    const source = await readFile(new URL("../src/index.tsx", import.meta.url), "utf8");
    const surface = source.match(/<div data-canvas-no-zoom[^>]*>/)?.[0] || "";
    const button = source.split("\n").find((line) => line.includes('<button type="button" disabled={!readiness.ready || running}')) || "";

    assert.doesNotMatch(surface, /onMouseDown/);
    assert.match(button, /onMouseDown/);
    assert.match(button, /onPointerDown/);
});

test("ffmpeg assets resolve from the page origin instead of the plugin blob url", async () => {
    const source = await readFile(new URL("../src/ffmpeg-runtime.ts", import.meta.url), "utf8");

    assert.doesNotMatch(source, /new URL\([^\n]*import\.meta\.url/);
    assert.match(source, /globalThis\.location\.origin/);
    assert.match(source, /\/plugins\/audio-track-tools\//);
});

class FakeFfmpeg {
    deleted: string[] = [];
    commands: string[][] = [];
    private readonly outputs: Record<string, Uint8Array>;
    private readonly exitCodes: number[];

    constructor(outputs: Record<string, number[]>, exitCodes = [0]) {
        this.outputs = Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, new Uint8Array(bytes)]));
        this.exitCodes = [...exitCodes];
    }

    async writeFile() {}
    async exec(command: string[]) { this.commands.push(command); return this.exitCodes.shift() ?? 0; }
    async readFile(path: string) { return this.outputs[path] || new Uint8Array(); }
    async deleteFile(path: string) { this.deleted.push(path); }
}
