export type VideoProviderKey = "openai" | "gemini" | "alibbit" | "kie";
export type VideoTaskKind = "text-to-video" | "image-to-video" | "reference-video" | "motion-control";
export type VideoSettingFieldKey = "size" | "vquality" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "mode" | "character_orientation" | "background_source";
export type VideoSettingField = {
    key: VideoSettingFieldKey;
    label: string;
    description?: string;
    type: "preset" | "select";
    required?: boolean;
    options?: Array<{ value: string; label: string }>;
};
export type VideoModelProfile = {
    id: string;
    provider: VideoProviderKey | "generic";
    task: VideoTaskKind;
    assets: {
        images?: { min?: number; max?: number; roles: string[] };
        videos?: { min?: number; max?: number; roles: string[] };
        audios?: { min?: number; max?: number; roles: string[] };
    };
    fields: VideoSettingField[];
};
export type VideoModelValidationContext = {
    prompt?: string;
    imageCount?: number;
    videoCount?: number;
    audioCount?: number;
};
type VideoModelInputConfig = {
    model: string;
    videoMode?: string;
    videoCharacterOrientation?: string;
    videoBackgroundSource?: string;
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

export function normalizeVideoModelName(model: string) {
    return (model || "").split("::").pop()?.trim() || "";
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
    return "";
}
