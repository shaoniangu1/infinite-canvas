import { nanoid } from "nanoid";

import { imageToDataUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { resolveProviderAspectRatio, resolveProviderResolution } from "../image-settings";
import { getBuiltinModelProfile } from "../model-profiles";
import { readProviderError, runAsyncTask, type RequestOptions } from "../media-task-runtime";

export type GeneratedImage = { id: string; dataUrl: string };

const alibbitTaskProfile = {
    submitPath: "/videos",
    pollPath: (taskId: string) => `/videos/${encodeURIComponent(taskId)}`,
    taskIdPath: "id",
    statusPath: "status",
    resultUrlPaths: ["url"],
    successStatuses: ["completed", "success", "succeeded", "finished"],
    failureStatuses: ["failed", "fail", "error", "cancelled", "canceled"],
    timeoutMessage: "Alibbit 图片生成超时，请稍后重试",
    pollIntervalMs: 2500,
};

export async function requestAlibbitImages(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, options?: RequestOptions): Promise<GeneratedImage[]> {
    try {
        const referenceImages = (await Promise.all(references.map((image) => imageToDataUrl(image)))).filter(Boolean);
        if (references.length && !referenceImages.length) throw new Error("参考图片读取失败，已取消请求，避免消耗生成额度");
        const model = resolveAlibbitModelId(config);
        const tasks = Array.from({ length: Math.max(1, count) }, async () => {
            const result = await runAsyncTask(
                config,
                alibbitTaskProfile,
                {
                    model,
                    prompt,
                    reference_images: referenceImages,
                },
                options,
            );
            const url = result.urls[0];
            if (!url) throw new Error("Alibbit 没有返回图片 URL");
            return { id: nanoid(), dataUrl: url };
        });
        return await Promise.all(tasks);
    } catch (error) {
        throw new Error(readProviderError(error, "Alibbit 图片生成失败"));
    }
}

export function resolveAlibbitModelId(config: Pick<AiConfig, "model" | "quality" | "resolution" | "size">) {
    const model = config.model.trim();
    if (model.startsWith("ali-banana2-") || model.startsWith("ali-gptimage2-")) return model;
    const profile = getBuiltinModelProfile(model);
    const family = profile?.alibbitFamily || resolveAlibbitFamilyAlias(model);
    if (!family) return model;
    const aspect = resolveAlibbitAspect(family, config.size);
    const quality = resolveAlibbitQuality(family, aspect, resolveProviderResolution(config));
    return family === "banana2" ? `ali-banana2-${aspect}-${quality}` : `ali-gptimage2-${aspect}-${quality}`;
}

function resolveAlibbitFamilyAlias(model: string) {
    const value = model.toLowerCase();
    if (value === "gpt-image-2" || value === "gptimage2" || value === "alibbit-gptimage2") return "gptimage2";
    if (value === "banana2" || value === "alibbit-banana2") return "banana2";
    return null;
}

function resolveAlibbitAspect(family: "banana2" | "gptimage2", size: string) {
    const value = size.trim().toLowerCase();
    if (!value || value === "auto") return family === "banana2" ? "autoaspect" : "auto";
    const supported = ["1:1", "16:9", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "21:9"];
    return resolveProviderAspectRatio({ quality: "medium", resolution: "2k", size: value }, supported);
}

function resolveAlibbitQuality(family: "banana2" | "gptimage2", aspect: string, resolution: string) {
    const value = resolution === "1k" || resolution === "2k" || resolution === "4k" ? resolution : "2k";
    if (family === "gptimage2" && aspect === "auto" && value === "4k") return "2k";
    return value;
}
