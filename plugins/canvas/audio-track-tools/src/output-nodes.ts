import type { CanvasAgentOp, CanvasNodeTypeId, CanvasPluginMediaFile } from "@infinite-canvas/plugin-sdk";

type OutputPlan = {
    processor: { id: string; position: { x: number; y: number }; width: number; height: number };
    outputId: string;
    nodeType: CanvasNodeTypeId;
    title: string;
    media: CanvasPluginMediaFile;
    exists: boolean;
    connected: boolean;
    yOffset: number;
};

export function buildOutputOps(plan: OutputPlan): CanvasAgentOp[] {
    const metadata = {
        content: plan.media.url,
        storageKey: plan.media.storageKey,
        mimeType: plan.media.mimeType,
        bytes: plan.media.bytes,
        naturalWidth: plan.media.width,
        naturalHeight: plan.media.height,
        durationMs: plan.media.durationMs,
        status: "success" as const,
        errorDetails: undefined,
    };
    const dimensions = plan.nodeType === "audio" ? { width: 320, height: 120 } : outputVideoSize(plan.media.width, plan.media.height);
    const nodeOp: CanvasAgentOp = plan.exists
        ? { type: "update_node", id: plan.outputId, patch: { title: plan.title, ...dimensions }, metadata }
        : {
              type: "add_node",
              id: plan.outputId,
              nodeType: plan.nodeType,
              title: plan.title,
              x: plan.processor.position.x + plan.processor.width + 100,
              y: plan.processor.position.y + plan.yOffset,
              ...dimensions,
              metadata,
          };
    return [nodeOp, ...(plan.connected ? [] : [{ type: "connect_nodes" as const, fromNodeId: plan.processor.id, toNodeId: plan.outputId }])];
}

function outputVideoSize(width?: number, height?: number) {
    if (!width || !height) return { width: 320, height: 180 };
    const scale = Math.min(360 / width, 240 / height, 1);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
