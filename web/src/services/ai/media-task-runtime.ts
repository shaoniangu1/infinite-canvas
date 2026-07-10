import axios from "axios";

import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";

export type RequestOptions = { signal?: AbortSignal };

export type AsyncTaskProfile = {
    submitPath: string;
    pollPath: (taskId: string) => string;
    taskIdPath: string;
    statusPath: string;
    resultUrlPaths?: string[];
    resultJsonPath?: string;
    resultItemsPath?: string;
    successStatuses: string[];
    failureStatuses: string[];
    timeoutMessage: string;
    pollIntervalMs?: number;
    maxAttempts?: number;
};

export type AsyncTaskResult = {
    taskId: string;
    urls: string[];
    payload: unknown;
};

export function providerHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function runAsyncTask(config: AiConfig, profile: AsyncTaskProfile, body: unknown, options?: RequestOptions): Promise<AsyncTaskResult> {
    const created = (
        await axios.post<unknown>(providerUrl(config, profile.submitPath), body, {
            headers: providerHeaders(config, "application/json"),
            signal: options?.signal,
        })
    ).data;
    const taskId = stringAtPath(created, profile.taskIdPath);
    if (!taskId) throw new Error("任务接口没有返回任务 ID");

    const maxAttempts = profile.maxAttempts || 120;
    const intervalMs = profile.pollIntervalMs || 2500;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const payload = (
            await axios.get<unknown>(providerUrl(config, profile.pollPath(taskId)), {
                headers: providerHeaders(config),
                signal: options?.signal,
            })
        ).data;
        const urls = extractResultUrls(payload, profile);
        const status = stringAtPath(payload, profile.statusPath).toLowerCase();
        if (urls.length && (!status || profile.successStatuses.includes(status))) return { taskId, urls, payload };
        if (profile.successStatuses.includes(status)) throw new Error("任务已完成但没有返回结果 URL");
        if (profile.failureStatuses.includes(status)) throw new Error(taskErrorMessage(payload) || "任务生成失败");
        if (attempt === maxAttempts - 1) throw new Error(profile.timeoutMessage);
        await delay(intervalMs, options?.signal);
    }
    throw new Error(profile.timeoutMessage);
}

export function providerUrl(config: Pick<AiConfig, "baseUrl">, path: string) {
    if (path.startsWith("/api/")) return `${config.baseUrl.trim().replace(/\/+$/, "")}${path}`;
    return buildApiUrl(config.baseUrl, path);
}

export function extractResultUrls(payload: unknown, profile: Pick<AsyncTaskProfile, "resultUrlPaths" | "resultJsonPath" | "resultItemsPath">) {
    const directUrls = (profile.resultUrlPaths || []).map((path) => stringAtPath(payload, path)).filter(Boolean);
    const resultJson = profile.resultJsonPath ? valueAtPath(payload, profile.resultJsonPath) : undefined;
    const parsed = typeof resultJson === "string" ? parseJson(resultJson) : resultJson;
    const items = profile.resultItemsPath ? valueAtPath(parsed, profile.resultItemsPath) : undefined;
    const itemUrls = Array.isArray(items) ? items.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
    return [...directUrls, ...itemUrls];
}

export function stringAtPath(payload: unknown, path: string) {
    const value = valueAtPath(payload, path);
    return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

export function valueAtPath(payload: unknown, path: string): unknown {
    if (!path) return payload;
    return path.split(".").reduce<unknown>((current, key) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[key];
    }, payload);
}

export function readProviderError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError(error)) return taskErrorMessage(error.response?.data) || statusMessage(error.response?.status, fallback);
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    return error instanceof Error ? taskErrorMessage(error.message) || error.message : fallback;
}

function taskErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            return taskErrorMessage(JSON.parse(value)) || value;
        } catch {
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: { message?: unknown }; data?: { failMsg?: unknown; errorMessage?: unknown } };
    return taskErrorMessage(payload.msg) || taskErrorMessage(payload.message) || taskErrorMessage(payload.error?.message) || taskErrorMessage(payload.data?.failMsg) || taskErrorMessage(payload.data?.errorMessage);
}

function parseJson(value: string) {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return undefined;
    }
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}
