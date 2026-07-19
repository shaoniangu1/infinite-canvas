import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";
import ts from "typescript";

const sourcePath = resolve("src/lib/canvas/plugin-media.ts");
const outPath = resolve(".tmp-plugin-media-tests/plugin-media.mjs");

after(async () => {
    await rm(resolve(".tmp-plugin-media-tests"), { recursive: true, force: true });
});

async function importPluginMedia() {
    const source = await readFile(sourcePath, "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, output);
    return import(`${pathToFileURL(outPath).href}?t=${Date.now()}`);
}

test("plugin media reads local storage before URL fallback", async () => {
    const { createPluginMedia } = await importPluginMedia();
    const local = new Blob(["local"], { type: "video/mp4" });
    let fetched = false;
    const media = createPluginMedia({
        getMediaBlob: async () => local,
        uploadMediaFile: async () => { throw new Error("not used"); },
        deleteStoredMedia: async () => undefined,
        fetchBlob: async () => { fetched = true; return new Blob(["remote"]); },
    });

    assert.equal(await (await media.read({ storageKey: "video:1", url: "https://example.com/video.mp4" })).text(), "local");
    assert.equal(fetched, false);
});

test("plugin media saves and removes through host storage", async () => {
    const { createPluginMedia } = await importPluginMedia();
    const removed = [];
    const media = createPluginMedia({
        getMediaBlob: async () => null,
        uploadMediaFile: async (blob, prefix) => ({ url: "blob:result", storageKey: `${prefix}:1`, bytes: blob.size, mimeType: blob.type }),
        deleteStoredMedia: async (keys) => { removed.push(...keys); },
        fetchBlob: async () => new Blob(),
    });

    assert.deepEqual(await media.save(new Blob(["result"], { type: "video/mp4" }), "plugin-video"), {
        url: "blob:result",
        storageKey: "plugin-video:1",
        bytes: 6,
        mimeType: "video/mp4",
    });
    await media.remove("plugin-video:1");
    assert.deepEqual(removed, ["plugin-video:1"]);
});

test("plugin media rejects unreadable sources", async () => {
    const { createPluginMedia } = await importPluginMedia();
    const media = createPluginMedia({
        getMediaBlob: async () => null,
        uploadMediaFile: async () => { throw new Error("not used"); },
        deleteStoredMedia: async () => undefined,
        fetchBlob: async () => { throw new Error("network failed"); },
    });

    await assert.rejects(() => media.read({ storageKey: "missing", url: "blob:missing" }), /媒体文件读取失败/);
});
