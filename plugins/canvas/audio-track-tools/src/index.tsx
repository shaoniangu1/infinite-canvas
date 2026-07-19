import { definePlugin, useState } from "@infinite-canvas/plugin-sdk";
import type { CanvasNodeContext, CanvasNodeContentProps, CanvasNodeData, CanvasPluginMediaFile } from "@infinite-canvas/plugin-sdk";

import { runWithFfmpeg } from "./ffmpeg-runtime";
import { selectMergeInputs, selectSplitInput } from "./media-plan";
import { mergeMedia, splitMedia } from "./media-processor";
import { buildOutputOps } from "./output-nodes";

type ProcessorKind = "split" | "merge";

function SplitContent({ ctx }: CanvasNodeContentProps) {
    return <ProcessorContent ctx={ctx} kind="split" />;
}

function MergeContent({ ctx }: CanvasNodeContentProps) {
    return <ProcessorContent ctx={ctx} kind="merge" />;
}

function ProcessorContent({ ctx, kind }: { ctx: CanvasNodeContext; kind: ProcessorKind }) {
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState("");
    const readiness = inputReadiness(ctx, kind);

    const run = async () => {
        if (!readiness.ready || running) return;
        setRunning(true);
        setProgress(0);
        setError("");
        ctx.updateMetadata({ status: "loading", errorDetails: undefined });
        try {
            if (kind === "split") await runSplit(ctx, setProgress);
            else await runMerge(ctx, setProgress);
            setProgress(1);
            ctx.updateMetadata({ status: "success", errorDetails: undefined });
        } catch (caught) {
            const message = readableError(caught);
            setError(message);
            ctx.updateMetadata({ status: "error", errorDetails: message });
        } finally {
            setRunning(false);
        }
    };

    const buttonStyle = {
        height: 34,
        borderRadius: 6,
        border: `1px solid ${ctx.theme.node.stroke}`,
        background: readiness.ready && !running ? ctx.theme.toolbar.activeBg : "transparent",
        color: readiness.ready ? ctx.theme.node.text : ctx.theme.node.placeholder,
        cursor: readiness.ready && !running ? "pointer" : "not-allowed",
        fontSize: 12,
        fontWeight: 600,
    } as const;

    return (
        <div data-canvas-no-zoom onWheel={(event) => event.stopPropagation()} style={{ boxSizing: "border-box", display: "flex", height: "100%", width: "100%", flexDirection: "column", gap: 10, padding: 12, color: ctx.theme.node.text }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{kind === "split" ? "分离视频音轨" : "合并视频音轨"}</div>
            <div style={{ minHeight: 34, fontSize: 11, lineHeight: 1.5, color: readiness.ready ? ctx.theme.node.muted : ctx.theme.node.placeholder }}>{readiness.message}</div>
            {running ? (
                <div style={{ display: "grid", gap: 5 }}>
                    <div style={{ height: 4, overflow: "hidden", borderRadius: 2, background: ctx.theme.node.stroke }}>
                        <div style={{ height: "100%", width: `${Math.max(4, Math.round(progress * 100))}%`, background: ctx.theme.node.text, transition: "width 160ms ease" }} />
                    </div>
                    <div style={{ fontSize: 10, color: ctx.theme.node.placeholder }}>{progress ? `处理中 ${Math.round(progress * 100)}%` : "正在加载处理引擎"}</div>
                </div>
            ) : error ? (
                <div role="alert" style={{ fontSize: 10, lineHeight: 1.4, color: "#ef4444" }}>{error}</div>
            ) : (
                <div style={{ flex: 1 }} />
            )}
            <button type="button" disabled={!readiness.ready || running} style={buttonStyle} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onClick={() => void run()}>
                {running ? "处理中" : kind === "split" ? "开始分离" : "合并成品"}
            </button>
        </div>
    );
}

async function runSplit(ctx: CanvasNodeContext, onProgress: (progress: number) => void) {
    const input = selectSplitInput(ctx.getUpstream());
    const source = await ctx.media.read(mediaSource(input));
    const result = await runWithFfmpeg((ffmpeg) => splitMedia(ffmpeg, source), onProgress);
    let video: CanvasPluginMediaFile | undefined;
    let audio: CanvasPluginMediaFile | undefined;
    try {
        video = await ctx.media.save(result.video, "audio-track-tools-video");
        audio = await ctx.media.save(result.audio, "audio-track-tools-audio");
        applyOutputs(ctx, [
            { id: `${ctx.node.id}-silent-video`, type: "video", title: "无音轨视频", media: video, yOffset: 0 },
            { id: `${ctx.node.id}-audio-track`, type: "audio", title: "提取音轨", media: audio, yOffset: 210 },
        ]);
    } catch (error) {
        await Promise.all([video?.storageKey ? ctx.media.remove(video.storageKey) : undefined, audio?.storageKey ? ctx.media.remove(audio.storageKey) : undefined]);
        throw error;
    }
}

async function runMerge(ctx: CanvasNodeContext, onProgress: (progress: number) => void) {
    const inputs = selectMergeInputs(ctx.getUpstream());
    const [videoBlob, audioBlob] = await Promise.all([ctx.media.read(mediaSource(inputs.video)), ctx.media.read(mediaSource(inputs.audio))]);
    const result = await runWithFfmpeg((ffmpeg) => mergeMedia(ffmpeg, videoBlob, audioBlob), onProgress);
    const media = await ctx.media.save(result, "audio-track-tools-final");
    try {
        applyOutputs(ctx, [{ id: `${ctx.node.id}-final-video`, type: "video", title: "成品视频", media, yOffset: 0 }]);
    } catch (error) {
        await ctx.media.remove(media.storageKey);
        throw error;
    }
}

function applyOutputs(ctx: CanvasNodeContext, outputs: Array<{ id: string; type: "video" | "audio"; title: string; media: CanvasPluginMediaFile; yOffset: number }>) {
    const oldStorageKeys: string[] = [];
    const ops = outputs.flatMap((output) => {
        const existing = ctx.getNode(output.id);
        const oldStorageKey = existing?.metadata?.storageKey;
        if (typeof oldStorageKey === "string" && oldStorageKey !== output.media.storageKey) oldStorageKeys.push(oldStorageKey);
        return buildOutputOps({
            processor: ctx.node,
            outputId: output.id,
            nodeType: output.type,
            title: output.title,
            media: output.media,
            exists: Boolean(existing),
            connected: ctx.getConnections().some((connection) => connection.fromNodeId === ctx.node.id && connection.toNodeId === output.id),
            yOffset: output.yOffset,
        });
    });
    ctx.applyOps(ops);
    oldStorageKeys.forEach((storageKey) => void ctx.media.remove(storageKey));
}

function inputReadiness(ctx: CanvasNodeContext, kind: ProcessorKind) {
    try {
        if (kind === "split") {
            const input = selectSplitInput(ctx.getUpstream());
            return { ready: true, message: `输入：${nodeLabel(input)}` };
        }
        const inputs = selectMergeInputs(ctx.getUpstream());
        return { ready: true, message: `视频：${nodeLabel(inputs.video)}\n音频：${nodeLabel(inputs.audio)}` };
    } catch (error) {
        return { ready: false, message: readableError(error) };
    }
}

function mediaSource(node: CanvasNodeData) {
    return {
        storageKey: typeof node.metadata?.storageKey === "string" ? node.metadata.storageKey : undefined,
        url: typeof node.metadata?.content === "string" ? node.metadata.content : undefined,
    };
}

function nodeLabel(node: { id: string; title?: string }) {
    return node.title || node.id;
}

function readableError(error: unknown) {
    if (error instanceof Error) return error.message;
    return typeof error === "string" ? error : "媒体处理失败";
}

export default definePlugin({
    id: "audio-track-tools",
    name: "视频音轨工具",
    version: "1.0.0",
    description: "在浏览器本地分离视频音轨，并把音轨重新合并到生成视频",
    nodes: [
        {
            type: "audio-track-tools:split",
            title: "分离视频音轨",
            icon: "🔇",
            description: "输出无音轨视频和独立音频",
            defaultSize: { width: 280, height: 170 },
            defaultMetadata: { status: "idle" },
            minimapColor: "#0f766e",
            hidePanel: true,
            Content: SplitContent,
        },
        {
            type: "audio-track-tools:merge",
            title: "合并视频音轨",
            icon: "🎞️",
            description: "把一个视频和一个音频合并为成品视频",
            defaultSize: { width: 280, height: 170 },
            defaultMetadata: { status: "idle" },
            minimapColor: "#2563eb",
            hidePanel: true,
            Content: MergeContent,
        },
    ],
});
