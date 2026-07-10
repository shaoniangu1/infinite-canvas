import { nanoid } from "nanoid";

import { imageToDataUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
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
        const referenceImages = await Promise.all(references.map((image) => imageToDataUrl(image)));
        const tasks = Array.from({ length: Math.max(1, count) }, async () => {
            const result = await runAsyncTask(
                config,
                alibbitTaskProfile,
                {
                    model: config.model,
                    prompt,
                    reference_images: referenceImages.filter(Boolean),
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
