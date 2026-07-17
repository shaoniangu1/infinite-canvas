import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";
import ts from "typescript";

const tempRoot = resolve(".tmp-model-plugin-tests");

async function importModelPlugin() {
    const path = resolve("src/services/api/model-plugin.ts");
    const source = await readFile(path, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText.replace('import { buildApiUrl } from "@/stores/use-config-store";', 'const buildApiUrl = (baseUrl, path) => `${baseUrl.replace(/\\/+$/, "")}/v1/${path.replace(/^\\/+/, "")}`;');
    const outPath = resolve(tempRoot, "model-plugin.mjs");
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, output);
    return import(`${pathToFileURL(outPath).href}?t=${Date.now()}`);
}

after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
});

test("video model scripts receive image, video and audio references", async () => {
    const { runModelPlugin } = await importModelPlugin();
    const result = await runModelPlugin({
        capability: "video",
        script: "return { images, videos, audios, params };",
        config: {
            model: "custom-video",
            baseUrl: "https://example.com",
            apiKey: "test-key",
            systemPrompt: "",
        },
        images: ["data:image/png;base64,a"],
        videos: ["https://example.com/motion.mp4"],
        audios: ["data:audio/mpeg;base64,b"],
        params: { mode: "720p" },
    });

    assert.deepEqual(result, {
        images: ["data:image/png;base64,a"],
        videos: ["https://example.com/motion.mp4"],
        audios: ["data:audio/mpeg;base64,b"],
        params: { mode: "720p" },
    });
});
