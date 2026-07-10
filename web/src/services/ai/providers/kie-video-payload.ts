import { isKieMotionControlModel, isKling30MotionControlModel, normalizedVideoFieldValue, validateVideoModelInputs } from "../video-model-profiles";

export type KieVideoPayloadConfig = {
    model: string;
    size?: string;
    vquality?: string;
    videoSeconds?: string;
    videoMode?: string;
    videoCharacterOrientation?: string;
    videoBackgroundSource?: string;
};

export function buildKieVideoTaskBody(config: KieVideoPayloadConfig, prompt: string, imageUrls: string[], videoUrls: string[], audioUrls: string[]) {
    if (isKieMotionControlModel(config.model)) {
        assertKieMotionControlInput(config, prompt, imageUrls, videoUrls);
        const videoMode = normalizedVideoFieldValue(config, "mode");
        const characterOrientation = normalizedVideoFieldValue(config, "character_orientation");
        const backgroundSource = normalizedVideoFieldValue(config, "background_source");
        const input = {
            input_urls: imageUrls,
            video_urls: videoUrls,
            ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
            ...(characterOrientation ? { character_orientation: characterOrientation } : {}),
            ...(videoMode ? { mode: videoMode } : {}),
            ...(isKling30MotionControlModel(config.model) && backgroundSource ? { background_source: backgroundSource } : {}),
        };
        return {
            model: config.model,
            callBackUrl: "",
            input,
        };
    }

    return {
        model: config.model,
        callBackUrl: "",
        input: {
            prompt,
            aspect_ratio: normalizeKieAspectRatio(config),
            duration: normalizeDuration(config.videoSeconds),
            resolution: normalizeResolution(config.vquality),
            ...(imageUrls.length ? { image_urls: imageUrls, input_urls: imageUrls } : {}),
            ...(videoUrls.length ? { video_urls: videoUrls } : {}),
            ...(audioUrls.length ? { audio_urls: audioUrls } : {}),
        },
    };
}

function assertKieMotionControlInput(config: KieVideoPayloadConfig, prompt: string, imageUrls: string[], videoUrls: string[]) {
    const errors = validateVideoModelInputs(config, { prompt, imageCount: imageUrls.length, videoCount: videoUrls.length });
    if (!errors.length) return;
    const first = errors[0];
    if (first.includes("人物图片")) throw new Error("KIE motion-control 需要连接 1 张人物图片");
    if (first.includes("动作参考视频")) throw new Error("KIE motion-control 需要连接 1 个动作参考视频");
    if (first.includes("背景来源")) throw new Error("请选择动作控制参数：背景来源");
    if (first.includes("模式") || first.includes("人物朝向")) throw new Error("请选择动作控制参数：模式和人物朝向");
    throw new Error(first);
}

function normalizeKieAspectRatio(config: Pick<KieVideoPayloadConfig, "size">) {
    const size = config.size || "16:9";
    if (["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"].includes(size)) return size;
    if (/^\d+x\d+$/.test(size)) {
        const [width, height] = size.split("x").map(Number);
        return width >= height ? "16:9" : "9:16";
    }
    return "16:9";
}

function normalizeDuration(value: string | undefined) {
    return Math.max(1, Math.min(20, Math.floor(Number(value) || 6)));
}

function normalizeResolution(value: string | undefined) {
    if (value === "low") return "480p";
    if (value === "medium" || value === "high" || value === "auto") return "720p";
    return value?.endsWith("p") ? value : `${value || "720"}p`;
}
