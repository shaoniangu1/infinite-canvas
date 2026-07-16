import axios from "axios";
import { nanoid } from "nanoid";

import { dataUrlToFile } from "@/lib/image-utils";
import { getMediaBlob } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { resolveProviderAspectRatio } from "../image-settings";
import { providerHeaders, readProviderError, runAsyncTask, type RequestOptions } from "../media-task-runtime";
import { buildKieVideoTaskBody } from "./kie-video-payload";
import type { GeneratedImage } from "./alibbit-provider";

export type GeneratedVideo = { blob?: Blob; url?: string; mimeType?: string };

const kieTaskProfile = {
    submitPath: "/api/v1/jobs/createTask",
    pollPath: (taskId: string) => `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    taskIdPath: "data.taskId",
    statusPath: "data.state",
    resultJsonPath: "data.resultJson",
    resultItemsPath: "resultUrls",
    successStatuses: ["success"],
    failureStatuses: ["fail", "failed", "error"],
    timeoutMessage: "KIE 任务生成超时，请稍后重试",
    pollIntervalMs: 5000,
    maxAttempts: 360,
};

const KIE_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-stream-upload";

export async function requestKieImages(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, options?: RequestOptions): Promise<GeneratedImage[]> {
    try {
        const imageUrls = await Promise.all(references.map((image) => uploadKieImageReference(config, image, options)));
        const result = await runAsyncTask(
            config,
            kieTaskProfile,
            {
                model: config.model,
                input: {
                    prompt,
                    aspect_ratio: normalizeKieAspectRatio(config),
                    count,
                    ...(imageUrls.length ? { image_urls: imageUrls } : {}),
                },
            },
            options,
        );
        const urls = result.urls.slice(0, Math.max(1, count));
        if (!urls.length) throw new Error("KIE 没有返回图片 URL");
        return urls.map((url) => ({ id: nanoid(), dataUrl: url }));
    } catch (error) {
        throw new Error(readProviderError(error, "KIE 图片生成失败"));
    }
}

export async function requestKieVideo(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<GeneratedVideo> {
    try {
        const imageUrls = await Promise.all(references.map((image) => uploadKieImageReference(config, image, options)));
        const videoUrls = await Promise.all(videoReferences.map((video) => uploadKieMediaReference(config, video, "video", options)));
        const audioUrls = await Promise.all(audioReferences.map((audio) => uploadKieMediaReference(config, audio, "audio", options)));
        const result = await runAsyncTask(
            config,
            kieTaskProfile,
            buildKieVideoTaskBody(config, prompt, imageUrls, videoUrls, audioUrls),
            options,
        );
        const url = result.urls[0];
        if (!url) throw new Error("KIE 没有返回视频 URL");
        return { url, mimeType: "video/mp4" };
    } catch (error) {
        throw new Error(readProviderError(error, "KIE 视频生成失败"));
    }
}

async function uploadKieImageReference(config: AiConfig, image: ReferenceImage, options?: RequestOptions) {
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    return uploadKieFile(config, dataUrlToFile({ ...image, dataUrl }), options);
}

async function uploadKieMediaReference(config: AiConfig, media: ReferenceVideo | ReferenceAudio, prefix: "video" | "audio", options?: RequestOptions) {
    let blob: Blob | null = null;
    if (media.storageKey) blob = await getMediaBlob(media.storageKey);
    if (!blob && media.url) blob = await (await fetch(media.url)).blob();
    if (!blob) throw new Error("参考素材读取失败，请重新上传后再生成");
    return uploadKieFile(config, new File([blob], media.name || `reference.${prefix === "video" ? "mp4" : "mp3"}`, { type: media.type || blob.type }), options);
}

async function uploadKieFile(config: AiConfig, file: File, options?: RequestOptions) {
    const body = new FormData();
    body.set("file", file);
    body.set("uploadPath", "infinite-canvas");
    body.set("fileName", `${Date.now()}-${file.name}`);
    const response = await axios.post<{ data?: { downloadUrl?: string }; msg?: string; error?: { message?: string } }>(KIE_UPLOAD_URL, body, {
        headers: providerHeaders(config),
        signal: options?.signal,
    });
    const url = response.data.data?.downloadUrl;
    if (!url) throw new Error(response.data.msg || response.data.error?.message || "KIE 参考素材上传失败");
    return url;
}

function normalizeKieAspectRatio(config: Pick<AiConfig, "quality" | "resolution" | "size">) {
    return resolveProviderAspectRatio(config, ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]);
}
