export type VideoProviderKey = "openai" | "gemini" | "alibbit" | "kie";
export type VideoTaskKind = "text-to-video" | "image-to-video" | "reference-video" | "motion-control" | "multimodal-video";
export type VideoSettingFieldKey = "size" | "vquality" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "mode" | "character_orientation" | "background_source" | "seed" | "clip_start" | "clip_end";
export type VideoSettingField = {
    key: VideoSettingFieldKey;
    label: string;
    description?: string;
    type: "preset" | "select" | "number";
    required?: boolean;
    requiredWhen?: "video";
    min?: number;
    max?: number;
    options?: Array<{ value: string; label: string }>;
};
export type VideoModelProfile = {
    id: string;
    provider: VideoProviderKey | "generic";
    task: VideoTaskKind;
    assets: {
        images?: { min?: number; max?: number; maxBytes?: number; maxDurationMs?: number; roles: string[] };
        videos?: { min?: number; max?: number; maxBytes?: number; maxDurationMs?: number; roles: string[] };
        audios?: { min?: number; max?: number; maxBytes?: number; maxDurationMs?: number; roles: string[] };
    };
    fields: VideoSettingField[];
};
export type VideoModelValidationContext = {
    prompt?: string;
    imageCount?: number;
    videoCount?: number;
    audioCount?: number;
    imageBytes?: Array<number | undefined>;
    videoBytes?: Array<number | undefined>;
    videoDurationsMs?: Array<number | undefined>;
};
type VideoModelInputConfig = {
    model: string;
    size?: string;
    vquality?: string;
    videoSeconds?: string;
    videoMode?: string;
    videoCharacterOrientation?: string;
    videoBackgroundSource?: string;
    videoSeed?: string;
    videoClipStart?: string;
    videoClipEnd?: string;
};

const baseVideoFields: VideoSettingField[] = [
    { key: "vquality", label: "清晰度", type: "preset" },
    { key: "size", label: "尺寸", type: "preset" },
    { key: "videoSeconds", label: "秒数", type: "preset" },
];

const seedanceFields: VideoSettingField[] = [
    { key: "vquality", label: "分辨率", type: "preset" },
    { key: "size", label: "比例", type: "preset" },
    { key: "videoSeconds", label: "时长", type: "preset" },
    { key: "videoGenerateAudio", label: "生成声音", type: "preset" },
    { key: "videoWatermark", label: "添加水印", type: "preset" },
];

const kieSeedanceFields: VideoSettingField[] = seedanceFields.filter((field) => field.key !== "videoWatermark");

const kieGeminiOmniVideoFields: VideoSettingField[] = [
    { key: "vquality", label: "分辨率", type: "preset", options: ["720p", "1080p", "4k"].map((value) => ({ value, label: value })) },
    { key: "size", label: "比例", type: "preset", options: ["16:9", "9:16"].map((value) => ({ value, label: value })) },
    { key: "videoSeconds", label: "时长", type: "preset", required: true, options: ["4", "6", "8", "10"].map((value) => ({ value, label: `${value} 秒` })) },
    { key: "seed", label: "Seed", type: "number", min: 0, max: 2147483647 },
    { key: "clip_start", label: "视频开始时间", type: "number", requiredWhen: "video", min: 0, max: 30 },
    { key: "clip_end", label: "视频结束时间", type: "number", requiredWhen: "video", min: 0, max: 30 },
];

const motionControlBaseFields: VideoSettingField[] = [
    {
        key: "mode",
        label: "模式",
        description: "KIE input.mode，std 为 720p，pro 为 1080p。",
        type: "select",
        options: [
            { value: "720p", label: "标准 720p" },
            { value: "1080p", label: "专业 1080p" },
        ],
    },
    {
        key: "character_orientation",
        label: "人物朝向",
        description: "KIE input.character_orientation，image 跟随人物图片，video 跟随动作视频。",
        type: "select",
        options: [
            { value: "image", label: "人物图片" },
            { value: "video", label: "动作视频" },
        ],
    },
];

const kling26MotionControlFields: VideoSettingField[] = motionControlBaseFields.map((field) => ({ ...field, required: true }));

const kling30MotionControlFields: VideoSettingField[] = [
    ...motionControlBaseFields,
    {
        key: "background_source",
        label: "背景来源",
        description: "KIE input.background_source，input_video 使用视频背景，input_image 使用图片背景。",
        type: "select",
        options: [
            { value: "input_video", label: "动作视频" },
            { value: "input_image", label: "人物图片" },
        ],
    },
];

export function getVideoModelProfile(model: string, provider: VideoProviderKey | "generic" = "generic"): VideoModelProfile {
    const normalized = normalizeVideoModelName(model);
    if (isKieGeminiOmniVideoModel(normalized)) {
        return {
            id: normalized,
            provider: "kie",
            task: "multimodal-video",
            assets: {
                images: { max: 7, maxBytes: 20 * 1024 * 1024, roles: ["reference_image"] },
                videos: { max: 1, maxBytes: 100 * 1024 * 1024, maxDurationMs: 30_000, roles: ["reference_video"] },
            },
            fields: kieGeminiOmniVideoFields,
        };
    }
    if (isKieMotionControlModel(normalized)) {
        return {
            id: normalized,
            provider: "kie",
            task: "motion-control",
            assets: {
                images: { min: 1, max: 1, roles: ["character_image"] },
                videos: { min: 1, max: 1, roles: ["motion_video"] },
            },
            fields: isKling30MotionControlModel(normalized) ? kling30MotionControlFields : kling26MotionControlFields,
        };
    }
    if (isKieSeedanceVideoModel(normalized)) {
        return {
            id: normalized,
            provider: "kie",
            task: "reference-video",
            assets: {
                images: { max: 9, roles: ["reference_image"] },
                videos: { max: 3, roles: ["reference_video"] },
                audios: { max: 3, roles: ["reference_audio"] },
            },
            fields: kieSeedanceFields,
        };
    }
    if (isSeedanceModel(normalized)) {
        return {
            id: normalized,
            provider,
            task: "reference-video",
            assets: {
                images: { max: 4, roles: ["reference_image"] },
                videos: { max: 1, roles: ["reference_video"] },
                audios: { max: 1, roles: ["reference_audio"] },
            },
            fields: seedanceFields,
        };
    }
    return {
        id: normalized,
        provider,
        task: "image-to-video",
        assets: { images: { max: 7, roles: ["reference_image"] } },
        fields: baseVideoFields,
    };
}

export function hasVideoProfileField(profile: VideoModelProfile, key: VideoSettingFieldKey) {
    return profile.fields.some((field) => field.key === key);
}

export function validateVideoModelInputs(config: VideoModelInputConfig, context: VideoModelValidationContext = {}) {
    const profile = getVideoModelProfile(config.model, "kie");
    if (isKieGeminiOmniVideoModel(profile.id)) return validateKieGeminiOmniVideoInputs(config, context);
    if (profile.provider === "kie" && isKieSeedanceVideoModel(profile.id)) return validateKieSeedanceInputs(context);
    if (profile.task !== "motion-control") return [];

    const errors: string[] = [];
    if ((context.imageCount || 0) < (profile.assets.images?.min || 0)) errors.push(`需要 ${profile.assets.images?.min} 张人物图片`);
    if ((context.videoCount || 0) < (profile.assets.videos?.min || 0)) errors.push(`需要 ${profile.assets.videos?.min} 个动作参考视频`);

    profile.fields.forEach((field) => {
        const value = videoFieldValue(config, field);
        if (!field.required && !value) return;
        if (!value) {
            errors.push(`${field.label}必填`);
            return;
        }
        if (field.options?.length && !field.options.some((option) => option.value === value)) {
            errors.push(`${field.label}不支持当前取值`);
        }
    });
    return errors;
}

export function normalizedVideoFieldValue(config: VideoModelInputConfig, key: VideoSettingFieldKey) {
    const profile = getVideoModelProfile(config.model, "kie");
    const field = profile.fields.find((item) => item.key === key);
    return field ? videoFieldValue(config, field) : "";
}

export function isKieMotionControlModel(model: string) {
    return /kling-[\d.]+\/motion-control/i.test(normalizeVideoModelName(model));
}

export function isKling30MotionControlModel(model: string) {
    return /^kling-3(?:\.0)?\/motion-control$/i.test(normalizeVideoModelName(model));
}

export function isKieSeedanceVideoModel(model: string) {
    return /^bytedance\/seedance-2(?:-(?:fast|mini))?$/i.test(normalizeVideoModelName(model));
}

export function isKieGeminiOmniVideoModel(model: string) {
    return /^gemini-omni-video$/i.test(normalizeVideoModelName(model));
}

export function normalizeVideoModelName(model: string) {
    return (model || "").split("::").pop()?.trim() || "";
}

export function videoClipValidationMessage(startValue: string, endValue: string, videoDurationMs?: number) {
    if (startValue === "" || endValue === "") return "";
    const start = Number(startValue);
    const end = Number(endValue);
    if (!Number.isFinite(start) || start < 0) return "视频开始时间必须是大于等于 0 的数字";
    if (!Number.isFinite(end) || end <= start) return "视频结束时间必须大于开始时间";
    if (end - start > 10) return "视频截取时长不能超过 10 秒";
    if (end > 30) return "视频结束时间不能超过 30 秒";
    if (videoDurationMs && end * 1000 > videoDurationMs) return "视频结束时间不能超过参考视频时长";
    return "";
}

function isSeedanceModel(model: string) {
    return /seedance/i.test(model);
}

function validateKieSeedanceInputs(context: VideoModelValidationContext) {
    const imageCount = context.imageCount || 0;
    const videoCount = context.videoCount || 0;
    const audioCount = context.audioCount || 0;
    const errors: string[] = [];
    if (!context.prompt?.trim()) errors.push("KIE Seedance 2 提示词必填");
    if (audioCount && !imageCount && !videoCount) errors.push("Seedance 参考音频不能单独使用，请同时连接参考图或参考视频");
    return errors;
}

function validateKieGeminiOmniVideoInputs(config: VideoModelInputConfig, context: VideoModelValidationContext) {
    const imageCount = context.imageCount || 0;
    const videoCount = context.videoCount || 0;
    const audioCount = context.audioCount || 0;
    const errors: string[] = [];
    if (!context.prompt?.trim()) errors.push("KIE Gemini Omni Video 提示词必填");
    else if (context.prompt.length > 20_000) errors.push("KIE Gemini Omni Video 提示词不能超过 20000 个字符");
    if (imageCount > 7) errors.push("参考图最多 7 张");
    if (videoCount > 1) errors.push("参考视频最多 1 个");
    if (audioCount) errors.push("Gemini Omni Video 不支持参考音频");
    if (imageCount + videoCount * 2 > 7) errors.push("图片与视频合计超出 7 个素材槽位，1 个视频占 2 个槽位");
    if (context.imageBytes?.some((bytes) => Boolean(bytes && bytes > 20 * 1024 * 1024))) errors.push("参考图单张不能超过 20MB");
    if (context.videoBytes?.some((bytes) => Boolean(bytes && bytes > 100 * 1024 * 1024))) errors.push("参考视频不能超过 100MB");
    if (context.videoDurationsMs?.some((duration) => Boolean(duration && duration > 30_000))) errors.push("参考视频时长不能超过 30 秒");
    if (!["4", "6", "8", "10"].includes(config.videoSeconds || "")) errors.push("时长仅支持 4、6、8 或 10 秒");
    if (config.size && !["16:9", "9:16"].includes(config.size)) errors.push("比例仅支持 16:9 或 9:16");
    if (config.vquality && !["720p", "1080p", "4k"].includes(config.vquality)) errors.push("分辨率仅支持 720p、1080p 或 4k");
    if (config.videoSeed && (!/^\d+$/.test(config.videoSeed) || Number(config.videoSeed) > 2147483647)) errors.push("Seed 必须是 0 到 2147483647 之间的整数");
    if (videoCount) {
        if (config.videoClipStart === undefined || config.videoClipStart === "") errors.push("视频开始时间必填");
        if (config.videoClipEnd === undefined || config.videoClipEnd === "") errors.push("视频结束时间必填");
        if (config.videoClipStart !== undefined && config.videoClipStart !== "" && config.videoClipEnd !== undefined && config.videoClipEnd !== "") {
            const clipError = videoClipValidationMessage(config.videoClipStart, config.videoClipEnd, context.videoDurationsMs?.[0]);
            if (clipError) errors.push(clipError);
        }
    }
    return errors;
}

function videoFieldValue(config: VideoModelInputConfig, field: VideoSettingField) {
    const value = rawVideoFieldValue(config, field.key);
    if (!value) return "";
    if (field.options?.length && !field.options.some((option) => option.value === value)) return "";
    return value;
}

function rawVideoFieldValue(config: VideoModelInputConfig, key: VideoSettingFieldKey) {
    if (key === "mode") return config.videoMode || "";
    if (key === "character_orientation") return config.videoCharacterOrientation || "";
    if (key === "background_source") return config.videoBackgroundSource || "";
    if (key === "seed") return config.videoSeed || "";
    if (key === "clip_start") return config.videoClipStart || "";
    if (key === "clip_end") return config.videoClipEnd || "";
    return "";
}
