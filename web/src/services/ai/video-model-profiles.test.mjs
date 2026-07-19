import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";
import ts from "typescript";

async function importTs(path) {
    await transpileTs(resolve("src/services/ai/seedance-model-settings.ts"));
    await transpileTs(resolve("src/services/ai/video-model-profiles.ts"));
    await transpileTs(resolve("src/services/ai/providers/kie-video-payload.ts"));
    await transpileTs(resolve("src/services/ai/media-task-runtime.ts"));
    const outPath = tempPath(path);
    return import(`${pathToFileURL(outPath).href}?t=${Date.now()}`);
}

async function transpileTs(path) {
    const source = await readFile(path, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
        .replace('import { buildApiUrl } from "@/stores/use-config-store";', 'function buildApiUrl(baseUrl, path) { return `${baseUrl.replace(/\\/+$/, "")}/${path.replace(/^\\/+/, "")}`; }')
        .replace(/from "(\.{1,2}\/[^"]+)";/g, 'from "$1.mjs";');
    const outPath = tempPath(path);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, output);
}

function tempPath(path) {
    return resolve(".tmp-tests", path.replace(resolve(), "").replace(/^[/\\]/, "").replace(/\.ts$/, ".mjs"));
}

const profilesPath = resolve("src/services/ai/video-model-profiles.ts");
const kiePayloadPath = resolve("src/services/ai/providers/kie-video-payload.ts");
const mediaTaskRuntimePath = resolve("src/services/ai/media-task-runtime.ts");
const kieProviderPath = resolve("src/services/ai/providers/kie-provider.ts");
const viteConfigPath = resolve("vite.config.ts");

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

test("KIE Seedance 2 profile exposes Seedance controls without watermark or motion-control fields", async () => {
    const { getVideoModelProfile } = await importTs(profilesPath);
    const profile = getVideoModelProfile("bytedance/seedance-2-fast", "kie");

    assert.equal(profile.provider, "kie");
    assert.equal(profile.task, "reference-video");
    assert.deepEqual(
        profile.fields.map((field) => field.key),
        ["vquality", "size", "videoSeconds", "videoGenerateAudio"],
    );
    assert.equal(profile.assets.images?.max, 9);
    assert.equal(profile.assets.videos?.max, 3);
    assert.equal(profile.assets.audios?.max, 3);
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

test("KIE Seedance 2 payload maps video settings and reference assets", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        {
            model: "bytedance/seedance-2",
            size: "9:16",
            vquality: "1080p",
            videoSeconds: "8",
            videoGenerateAudio: "false",
        },
        "make a fashion campaign video",
        ["https://example.com/ref-1.png"],
        ["https://example.com/ref-1.mp4"],
        ["https://example.com/ref-1.mp3"],
    );

    assert.deepEqual(body, {
        model: "bytedance/seedance-2",
        input: {
            prompt: "make a fashion campaign video",
            resolution: "1080p",
            aspect_ratio: "9:16",
            duration: 8,
            generate_audio: false,
            reference_image_urls: ["https://example.com/ref-1.png"],
            reference_video_urls: ["https://example.com/ref-1.mp4"],
            reference_audio_urls: ["https://example.com/ref-1.mp3"],
        },
    });
});

test("KIE Seedance 2 payload omits empty reference arrays", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        {
            model: "bytedance/seedance-2-mini",
            size: "1280x720",
            vquality: "720",
            videoSeconds: "5",
            videoGenerateAudio: "true",
        },
        "make a short video",
        [],
        [],
        [],
    );

    assert.deepEqual(body, {
        model: "bytedance/seedance-2-mini",
        input: {
            prompt: "make a short video",
            resolution: "720p",
            aspect_ratio: "16:9",
            duration: 5,
            generate_audio: true,
        },
    });
});

test("KIE Seedance 2 payload maps smart duration to provider default range", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        {
            model: "bytedance/seedance-2",
            size: "adaptive",
            vquality: "480p",
            videoSeconds: "-1",
        },
        "make a short video",
        ["https://example.com/ref-1.png"],
        ["https://example.com/ref-1.mp4"],
        [],
    );

    assert.equal(body.input.duration, 5);
});

test("KIE Seedance 2 payload rejects audio-only input", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);

    assert.throws(
        () => buildKieVideoTaskBody({ model: "bytedance/seedance-2-fast" }, "make a video with this soundtrack", [], [], ["https://example.com/ref-1.mp3"]),
        /参考音频不能单独使用/,
    );
});

test("KIE Seedance 2 payload requires prompt before submit", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);

    assert.throws(
        () => buildKieVideoTaskBody({ model: "bytedance/seedance-2" }, "", ["https://example.com/ref-1.png"], ["https://example.com/ref-1.mp4"], []),
        /提示词必填/,
    );
});

test("KIE Seedance 2 supports 4k resolution", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        {
            model: "bytedance/seedance-2",
            size: "16:9",
            vquality: "4k",
        },
        "make a cinematic video",
        [],
        [],
        [],
    );

    assert.equal(body.input.resolution, "4k");
});

test("KIE Seedance 2 fast and mini reject 1080p by falling back to 720p", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const fastBody = buildKieVideoTaskBody(
        {
            model: "bytedance/seedance-2-fast",
            size: "1:1",
            vquality: "1080p",
        },
        "make a square video",
        [],
        [],
        [],
    );
    const miniBody = buildKieVideoTaskBody(
        {
            model: "bytedance/seedance-2-mini",
            size: "1:1",
            vquality: "1080p",
        },
        "make a square video",
        [],
        [],
        [],
    );

    assert.equal(fastBody.input.resolution, "720p");
    assert.equal(miniBody.input.resolution, "720p");
});

test("KIE Gemini Omni Video profile exposes only the core video workflow", async () => {
    const { getVideoModelProfile } = await importTs(profilesPath);
    const profile = getVideoModelProfile("gemini-omni-video", "kie");

    assert.equal(profile.provider, "kie");
    assert.equal(profile.task, "multimodal-video");
    assert.deepEqual(
        profile.fields.map((field) => field.key),
        ["vquality", "size", "videoSeconds", "seed", "clip_start", "clip_end"],
    );
    assert.deepEqual(profile.assets.images, { max: 7, maxBytes: 20 * 1024 * 1024, roles: ["reference_image"] });
    assert.deepEqual(profile.assets.videos, { max: 1, maxBytes: 100 * 1024 * 1024, maxDurationMs: 30_000, roles: ["reference_video"] });
    assert.equal(profile.assets.audios, undefined);
    assert.deepEqual(
        profile.fields.filter((field) => ["seed", "clip_start", "clip_end"].includes(field.key)).map(({ key, type, min, max, requiredWhen }) => ({ key, type, min, max, requiredWhen })),
        [
            { key: "seed", type: "number", min: 0, max: 2147483647, requiredWhen: undefined },
            { key: "clip_start", type: "number", min: 0, max: 30, requiredWhen: "video" },
            { key: "clip_end", type: "number", min: 0, max: 30, requiredWhen: "video" },
        ],
    );
});

test("KIE Gemini Omni Video payload matches the official request example", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        {
            model: "gemini-omni-video",
            size: "16:9",
            vquality: "720p",
            videoSeconds: "4",
            videoSeed: "1688",
            videoClipStart: "0",
            videoClipEnd: "10",
        },
        "turn the references into a short video",
        ["https://example.com/reference.png"],
        ["https://example.com/reference.mp4"],
        [],
    );

    assert.deepEqual(body, {
        model: "gemini-omni-video",
        input: {
            prompt: "turn the references into a short video",
            image_urls: ["https://example.com/reference.png"],
            video_list: [{ url: "https://example.com/reference.mp4", start: 0, ends: 10 }],
            duration: "4",
            aspect_ratio: "16:9",
            seed: 1688,
            resolution: "720p",
        },
    });
});

test("KIE Gemini Omni Video omits unselected optional fields and empty assets", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);
    const body = buildKieVideoTaskBody(
        { model: "gemini-omni-video", videoSeconds: "6" },
        "make a video",
        [],
        [],
        [],
    );

    assert.deepEqual(body, {
        model: "gemini-omni-video",
        input: {
            prompt: "make a video",
            duration: "6",
        },
    });
});

test("KIE Gemini Omni Video validates prompt, enums, seed and asset limits", async () => {
    const { validateVideoModelInputs } = await importTs(profilesPath);
    const errors = validateVideoModelInputs(
        {
            model: "gemini-omni-video",
            size: "1:1",
            vquality: "8k",
            videoSeconds: "5",
            videoSeed: "2147483648",
            videoClipStart: "0",
            videoClipEnd: "10",
        },
        { prompt: "", imageCount: 8, videoCount: 2, audioCount: 1 },
    );

    assert.deepEqual(errors, [
        "KIE Gemini Omni Video 提示词必填",
        "参考图最多 7 张",
        "参考视频最多 1 个",
        "Gemini Omni Video 不支持参考音频",
        "图片与视频合计超出 7 个素材槽位，1 个视频占 2 个槽位",
        "时长仅支持 4、6、8 或 10 秒",
        "比例仅支持 16:9 或 9:16",
        "分辨率仅支持 720p、1080p 或 4k",
        "Seed 必须是 0 到 2147483647 之间的整数",
    ]);
});

test("KIE Gemini Omni Video rejects prompts longer than 20000 characters", async () => {
    const { validateVideoModelInputs } = await importTs(profilesPath);

    assert.deepEqual(
        validateVideoModelInputs(
            { model: "gemini-omni-video", videoSeconds: "4" },
            { prompt: "x".repeat(20_001) },
        ),
        ["KIE Gemini Omni Video 提示词不能超过 20000 个字符"],
    );
});

test("KIE Gemini Omni Video validates video trim bounds", async () => {
    const { validateVideoModelInputs } = await importTs(profilesPath);

    assert.deepEqual(
        validateVideoModelInputs(
            { model: "gemini-omni-video", videoSeconds: "4" },
            { prompt: "prompt", videoCount: 1 },
        ),
        ["视频开始时间必填", "视频结束时间必填"],
    );
    assert.deepEqual(
        validateVideoModelInputs(
            { model: "gemini-omni-video", videoSeconds: "4", videoClipStart: "10", videoClipEnd: "5" },
            { prompt: "prompt", videoCount: 1 },
        ),
        ["视频结束时间必须大于开始时间"],
    );
    assert.deepEqual(
        validateVideoModelInputs(
            { model: "gemini-omni-video", videoSeconds: "4", videoClipStart: "0", videoClipEnd: "11" },
            { prompt: "prompt", videoCount: 1 },
        ),
        ["视频截取时长不能超过 10 秒"],
    );
    assert.deepEqual(
        validateVideoModelInputs(
            { model: "gemini-omni-video", videoSeconds: "4", videoClipStart: "21", videoClipEnd: "31" },
            { prompt: "prompt", videoCount: 1 },
        ),
        ["视频结束时间不能超过 30 秒"],
    );
});

test("KIE Gemini Omni Video exposes an immediate trim validation message", async () => {
    const { videoClipValidationMessage } = await importTs(profilesPath);

    assert.equal(videoClipValidationMessage("0", "12"), "视频截取时长不能超过 10 秒");
    assert.equal(videoClipValidationMessage("12", "22"), "");
});

test("KIE Gemini Omni Video validates reference file size and source video duration", async () => {
    const { validateVideoModelInputs } = await importTs(profilesPath);

    assert.deepEqual(
        validateVideoModelInputs(
            { model: "gemini-omni-video", videoSeconds: "4", videoClipStart: "0", videoClipEnd: "8" },
            {
                prompt: "prompt",
                imageCount: 1,
                videoCount: 1,
                imageBytes: [20 * 1024 * 1024 + 1],
                videoBytes: [100 * 1024 * 1024 + 1],
                videoDurationsMs: [31_000],
            },
        ),
        ["参考图单张不能超过 20MB", "参考视频不能超过 100MB", "参考视频时长不能超过 30 秒"],
    );
    assert.deepEqual(
        validateVideoModelInputs(
            { model: "gemini-omni-video", videoSeconds: "4", videoClipStart: "0", videoClipEnd: "8" },
            { prompt: "prompt", videoCount: 1, videoDurationsMs: [6_000] },
        ),
        ["视频结束时间不能超过参考视频时长"],
    );
});

test("KIE Gemini Omni Video rejects invalid payload before creating a task", async () => {
    const { buildKieVideoTaskBody } = await importTs(kiePayloadPath);

    assert.throws(
        () => buildKieVideoTaskBody({ model: "gemini-omni-video", videoSeconds: "4" }, "", [], [], []),
        /提示词必填/,
    );
    assert.throws(
        () => buildKieVideoTaskBody({ model: "gemini-omni-video", videoSeconds: "4" }, "prompt", [], [], ["https:\/\/example.com\/audio.mp3"]),
        /不支持参考音频/,
    );
});

test("KIE Gemini Omni Video preview is captured before createTask submission", async () => {
    const providerSource = await readFile(kieProviderPath, "utf8");
    const requestKieVideo = providerSource.slice(providerSource.indexOf("export async function requestKieVideo"), providerSource.indexOf("async function uploadKieImageReference"));
    const viteConfig = await readFile(viteConfigPath, "utf8");

    assert.match(requestKieVideo, /isKieGeminiOmniVideoModel/);
    assert.match(requestKieVideo, /await captureKieRequestPreview\(body\)/);
    assert.ok(requestKieVideo.indexOf("await captureKieRequestPreview(body)") < requestKieVideo.indexOf("runAsyncTask("));
    assert.match(viteConfig, /\/__debug\/kie-request-preview/);
    assert.match(viteConfig, /infinite-canvas-kie-request-preview\.json/);
});

test("KIE result URL extraction accepts common resultJson url shapes", async () => {
    const { extractResultUrls } = await importTs(mediaTaskRuntimePath);
    const profile = { resultJsonPath: "data.resultJson", resultItemsPath: "resultUrls" };

    assert.deepEqual(extractResultUrls({ data: { resultJson: JSON.stringify({ resultUrls: ["https://example.com/result.mp4"] }) } }, profile), ["https://example.com/result.mp4"]);
    assert.deepEqual(extractResultUrls({ data: { resultJson: JSON.stringify({ video_url: "https://example.com/video.mp4" }) } }, profile), ["https://example.com/video.mp4"]);
});
