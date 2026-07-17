import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";
import ts from "typescript";

const tempRoot = resolve(".tmp-provider-tests");

async function transpile(path, replacements = []) {
    const source = await readFile(path, "utf8");
    let output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    replacements.forEach(([from, to]) => {
        output = output.replace(from, to);
    });
    output = output.replace(/from "(\.{1,2}\/[^\"]+)";/g, 'from "$1.mjs";');
    const outPath = tempPath(path);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, output);
    return outPath;
}

function tempPath(path) {
    return resolve(tempRoot, path.replace(resolve(), "").replace(/^[/\\]/, "").replace(/\.ts$/, ".mjs"));
}

async function importAlibbitProvider() {
    await transpile(resolve("src/services/ai/image-settings.ts"));
    await transpile(resolve("src/services/ai/model-profiles.ts"));
    const path = await transpile(resolve("src/services/ai/providers/alibbit-provider.ts"), [
        ['import { imageToDataUrl } from "@/services/image-storage";', "const imageToDataUrl = async (image) => image.dataUrl;"],
        ['import { readProviderError, runAsyncTask } from "../media-task-runtime";', 'const readProviderError = (error) => String(error); const runAsyncTask = async () => ({ urls: [] });'],
    ]);
    return import(`${pathToFileURL(path).href}?t=${Date.now()}`);
}

after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
});

test("Alibbit abstract image models resolve to concrete provider model IDs", async () => {
    const { resolveAlibbitModelId } = await importAlibbitProvider();

    assert.equal(resolveAlibbitModelId({ model: "alibbit-banana2", quality: "medium", resolution: "1k", size: "1:1" }), "ali-banana2-1:1-1k");
    assert.equal(resolveAlibbitModelId({ model: "alibbit-gptimage2", quality: "high", resolution: "4k", size: "16:9" }), "ali-gptimage2-16:9-4k");
    assert.equal(resolveAlibbitModelId({ model: "alibbit-gptimage2", quality: "high", resolution: "4k", size: "auto" }), "ali-gptimage2-auto-2k");
});
