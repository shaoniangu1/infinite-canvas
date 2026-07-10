import type { AiConfig } from "@/stores/use-config-store";

export type ImageQuality = "low" | "medium" | "high";
export type ImageResolution = "1k" | "2k" | "4k";

export type ImageGenerationSettings = {
    quality: ImageQuality;
    resolution: ImageResolution;
    aspectRatio: string;
};

const RESOLUTION_LONG_EDGE: Record<ImageResolution, number> = {
    "1k": 1024,
    "2k": 2048,
    "4k": 3840,
};
const IMAGE_QUALITIES = ["low", "medium", "high"] as const;
const IMAGE_RESOLUTIONS = ["1k", "2k", "4k"] as const;
const DEFAULT_IMAGE_RESOLUTION: ImageResolution = "2k";
const DEFAULT_IMAGE_ASPECT_RATIO = "1:1";
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;

export const IMAGE_ASPECT_RATIOS = ["1:1", "1:2", "2:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9", "9:21"];
export const GEMINI_SUPPORTED_RATIOS = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"];

export function resolveImageSettings(config: Pick<AiConfig, "quality" | "resolution" | "size">): ImageGenerationSettings {
    return {
        quality: normalizeImageQuality(config.quality),
        resolution: normalizeImageResolution(config.resolution),
        aspectRatio: normalizeAspectRatio(config.size),
    };
}

export function normalizeImageQuality(value: string): ImageQuality {
    const normalized = value.trim().toLowerCase();
    return IMAGE_QUALITIES.includes(normalized as ImageQuality) ? (normalized as ImageQuality) : "medium";
}

export function normalizeImageResolution(value: string): ImageResolution {
    const normalized = value.trim().toLowerCase();
    return IMAGE_RESOLUTIONS.includes(normalized as ImageResolution) ? (normalized as ImageResolution) : DEFAULT_IMAGE_RESOLUTION;
}

export function normalizeAspectRatio(value: string) {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes(":")) return closestAspectRatio(normalized, IMAGE_ASPECT_RATIOS);
    return DEFAULT_IMAGE_ASPECT_RATIO;
}

export function resolveOpenAiQuality(settings: ImageGenerationSettings) {
    return settings.quality === "medium" ? "medium" : settings.quality;
}

export function resolveOpenAiSize(settings: ImageGenerationSettings) {
    return dimensionsForResolutionAndRatio(settings.resolution, settings.aspectRatio);
}

export function resolveGeminiImageConfig(config: Pick<AiConfig, "model" | "quality" | "resolution" | "size">) {
    const settings = resolveImageSettings(config);
    const aspectRatio = closestAspectRatio(settings.aspectRatio, GEMINI_SUPPORTED_RATIOS);
    const imageSize = supportsGeminiImageSize(config.model) ? geminiImageSize(settings.resolution) : undefined;
    const image = { ...(aspectRatio ? { aspectRatio } : {}), ...(imageSize ? { imageSize } : {}) };
    return Object.keys(image).length ? { responseFormat: { image } } : {};
}

export function resolveProviderAspectRatio(config: Pick<AiConfig, "quality" | "resolution" | "size">, supported: string[]) {
    const settings = resolveImageSettings(config);
    return closestAspectRatio(settings.aspectRatio, supported);
}

export function resolveProviderResolution(config: Pick<AiConfig, "quality" | "resolution" | "size">) {
    return resolveImageSettings(config).resolution;
}

export function imageQualityLabel(value: string) {
    return ({ low: "低画质", medium: "标准画质", high: "高画质" } as Record<string, string>)[value] || value;
}

export function imageResolutionLabel(value: string) {
    return ({ "1k": "1K", "2k": "2K", "4k": "4K" } as Record<string, string>)[value] || value;
}

export function imageAspectRatioLabel(value: string) {
    return normalizeAspectRatio(value);
}

function dimensionsForResolutionAndRatio(resolution: ImageResolution, ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longEdge = RESOLUTION_LONG_EDGE[resolution];
    let shortEdge = Math.round(longEdge / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    if (longEdge * shortEdge < IMAGE_MIN_PIXELS) {
        longEdge = Math.ceil(Math.sqrt(IMAGE_MIN_PIXELS * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortEdge = Math.round(longEdge / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }
    if (longEdge * shortEdge > IMAGE_MAX_PIXELS) {
        longEdge = Math.floor(Math.sqrt(IMAGE_MAX_PIXELS * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortEdge = Math.round(longEdge / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }
    const width = isLandscape ? longEdge : shortEdge;
    const height = isLandscape ? shortEdge : longEdge;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function parseImageRatio(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error("图像比例格式不支持，请使用 1:1 或 16:9");
    const width = Number(parts[0]);
    const height = Number(parts[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("图像比例必须是正数，例如 9:16");
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整比例");
    return { width, height };
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("图像尺寸必须是正整数，例如 1024x1024");
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error("图像尺寸的宽高必须是 16 的倍数，请调整尺寸");
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error("图像尺寸最长边不能超过 3840px，请调整尺寸");
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error("图像总像素需在 655360 到 8294400 之间，请调整尺寸");
}

function closestAspectRatio(value: string, supported: string[]) {
    const target = ratioNumber(value);
    return supported.reduce((best, item) => (Math.abs(ratioNumber(item) - target) < Math.abs(ratioNumber(best) - target) ? item : best));
}

function ratioNumber(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error("图像比例格式不支持，请使用 1:1 或 16:9");
    const width = Number(parts[0]);
    const height = Number(parts[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("图像比例必须是正数，例如 9:16");
    return width / height;
}

function supportsGeminiImageSize(model: string) {
    const value = model.toLowerCase();
    return value.includes("gemini-3") || value.includes("3.1") || value.includes("3-pro");
}

function geminiImageSize(resolution: ImageResolution) {
    return resolution === "1k" ? "1K" : resolution === "2k" ? "2K" : "4K";
}
