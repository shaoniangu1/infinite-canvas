import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";
import ts from "typescript";

async function importTs(path) {
    await transpileTs(resolve("src/services/ai/video-model-profiles.ts"));
    await transpileTs(resolve("src/services/ai/providers/kie-video-payload.ts"));
    const outPath = tempPath(path);
    return import(`${pathToFileURL(outPath).href}?t=${Date.now()}`);
}

async function transpileTs(path) {
    const source = await readFile(path, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText.replace(/from "([^"]+)";/g, 'from "$1.mjs";');
    const outPath = tempPath(path);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, output);
}

function tempPath(path) {
    return resolve(".tmp-tests", path.replace(resolve(), "").replace(/^[/\\]/, "").replace(/\.ts$/, ".mjs"));
}

const profilesPath = resolve("src/services/ai/video-model-profiles.ts");
const kiePayloadPath = resolve("src/services/ai/providers/kie-video-payload.ts");

after(async () => {
    await rm(resolve(".tmp-tests"), { recursive: true, force: true });
});

test("Kling 2.6 motion-control profile exposes only 2.6 fields", async () => {
    const { getVideoModelProfile } = await importTs(profilesPath);
    const profile = getVideoModelProfile("kling-2.6/motion-control", "kie");

    assert.equal(profile.task, "motion-control");
    assert.deepEqual(
        profile.fields.map((field) => field.key),
        ["mode", "character_orientation"],
    );
    assert.deepEqual(profile.fields.find((field) => field.key === "mode")?.options?.map((item) => item.value), ["720p", "1080p"]);
    assert.deepEqual(profile.fields.find((field) => field.key === "character_orientation")?.options?.map((item) => item.value), ["image", "video"]);
    assert.equal(profile.assets.images?.min, 1);
    assert.equal(profile.assets.videos?.min, 1);
});

test("Kling 3.0 motion-control profile includes background source", async () => {
    const { getVideoModelProfile } = await importTs(profilesPath);
    const profile = getVideoModelProfile("kling-3.0/motion-control", "kie");

    assert.deepEqual(
        profile.fields.map((field) => field.key),
        ["mode", "character_orientation", "background_source"],
    );
    assert.deepEqual(profile.fields.find((field) => field.key === "background_source")?.options?.map((item) => item.value), ["input_video", "input_image"]);
});

test("Seedance profile keeps Seedance output controls and hides motion-control fields", async () => {
    const { getVideoModelProfile } = await importTs(profilesPath);
    const profile = getVideoModelProfile("doubao-seedance-1-0-pro", "openai");

    assert.equal(profile.task, "reference-video");
    assert.deepEqual(
        profile.fields.map((field) => field.key),
        ["vquality", "size", "videoSeconds", "videoGenerateAudio", "videoWatermark"],
    );
});

test("Kling 2.6 motion-control payload matches KIE request body", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        {
            model: "kling-2.6/motion-control",
            size: "1024x1024",
            vquality: "720",
            videoSeconds: "6",
            videoMode: "720p",
            videoCharacterOrientation: "image",
        },
        "make the character follow the motion",
        ["https://example.com/character.png"],
        ["https://example.com/motion.mp4"],
        [],
    );

    assert.deepEqual(body, {
        model: "kling-2.6/motion-control",
        callBackUrl: "",
        input: {
            prompt: "make the character follow the motion",
            input_urls: ["https://example.com/character.png"],
            video_urls: ["https://example.com/motion.mp4"],
            character_orientation: "image",
            mode: "720p",
        },
    });
});

test("Kling 3.0 motion-control payload matches KIE request body", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        {
            model: "kling-3.0/motion-control",
            videoMode: "720p",
            videoCharacterOrientation: "image",
            videoBackgroundSource: "input_video",
        },
        "make the character follow the motion",
        ["https://example.com/character.png"],
        ["https://example.com/motion.mp4"],
        [],
    );

    assert.deepEqual(body, {
        model: "kling-3.0/motion-control",
        callBackUrl: "",
        input: {
            prompt: "make the character follow the motion",
            input_urls: ["https://example.com/character.png"],
            video_urls: ["https://example.com/motion.mp4"],
            mode: "720p",
            character_orientation: "image",
            background_source: "input_video",
        },
    });
});

test("KIE motion-control validates required inputs and optional enum values before submit", async () => {
    const { validateVideoModelInputs } = await importTs(profilesPath);

    assert.deepEqual(validateVideoModelInputs({ model: "kling-2.6/motion-control", videoMode: "", videoCharacterOrientation: "" }, { prompt: "", imageCount: 0, videoCount: 0 }), [
        "需要 1 张人物图片",
        "需要 1 个动作参考视频",
        "模式必填",
        "人物朝向必填",
    ]);
    assert.deepEqual(validateVideoModelInputs({ model: "kling-3.0/motion-control", videoMode: "bad", videoCharacterOrientation: "image", videoBackgroundSource: "bad" }, { prompt: "prompt", imageCount: 1, videoCount: 1 }), []);
});

test("KIE motion-control omits optional fields when using provider defaults", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        { model: "kling-3.0/motion-control" },
        "make the character follow the motion",
        ["https://example.com/character.png"],
        ["https://example.com/motion.mp4"],
        [],
    );

    assert.deepEqual(body, {
        model: "kling-3.0/motion-control",
        callBackUrl: "",
        input: {
            prompt: "make the character follow the motion",
            input_urls: ["https://example.com/character.png"],
            video_urls: ["https://example.com/motion.mp4"],
        },
    });
});

test("Kling 3.0 motion-control treats stale invalid optional fields as unselected", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        { model: "kling-3.0/motion-control", videoMode: "std", videoCharacterOrientation: "original", videoBackgroundSource: "input" },
        "",
        ["https://example.com/character.png"],
        ["https://example.com/motion.mp4"],
        [],
    );

    assert.deepEqual(body, {
        model: "kling-3.0/motion-control",
        callBackUrl: "",
        input: {
            input_urls: ["https://example.com/character.png"],
            video_urls: ["https://example.com/motion.mp4"],
        },
    });
});

test("KIE motion-control allows empty prompt and omits it from payload", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        { model: "kling-2.6/motion-control", videoMode: "720p", videoCharacterOrientation: "image" },
        "",
        ["https://example.com/character.png"],
        ["https://example.com/motion.mp4"],
        [],
    );

    assert.deepEqual(body, {
        model: "kling-2.6/motion-control",
        callBackUrl: "",
        input: {
            input_urls: ["https://example.com/character.png"],
            video_urls: ["https://example.com/motion.mp4"],
            character_orientation: "image",
            mode: "720p",
        },
    });
});

test("KIE motion-control payload rejects missing required references", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);

    assert.throws(
        () => buildKieVideoTaskBody({ model: "kling-2.6/motion-control", videoMode: "std", videoCharacterOrientation: "original", videoBackgroundSource: "input" }, "prompt", [], ["https://example.com/motion.mp4"], []),
        /需要连接 1 张人物图片/,
    );
    assert.throws(
        () => buildKieVideoTaskBody({ model: "kling-2.6/motion-control", videoMode: "std", videoCharacterOrientation: "original", videoBackgroundSource: "input" }, "prompt", ["https://example.com/character.png"], [], []),
        /需要连接 1 个动作参考视频/,
    );
    assert.throws(
        () => buildKieVideoTaskBody({ model: "kling-2.6/motion-control", videoMode: "720p" }, "prompt", ["https://example.com/character.png"], ["https://example.com/motion.mp4"], []),
        /请选择动作控制参数：模式和人物朝向/,
    );
});
