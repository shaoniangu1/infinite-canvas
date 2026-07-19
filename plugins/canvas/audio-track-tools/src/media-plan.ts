export type MediaInputNode = {
    id: string;
    type: string;
    metadata?: {
        content?: unknown;
        storageKey?: unknown;
        mimeType?: unknown;
    };
};

export function selectSplitInput<T extends MediaInputNode>(nodes: T[]): T {
    const videos = nodes.filter((node) => node.type === "video" && hasReadableMedia(node));
    if (!videos.length) throw new Error("需要连接 1 个视频节点");
    if (videos.length > 1) throw new Error("只能连接 1 个视频节点");
    return videos[0];
}

export function selectMergeInputs<T extends MediaInputNode>(nodes: T[]): { video: T; audio: T } {
    const videos = nodes.filter((node) => node.type === "video" && hasReadableMedia(node));
    const audios = nodes.filter((node) => node.type === "audio" && hasReadableMedia(node));
    if (!videos.length) throw new Error("需要连接 1 个视频节点");
    if (videos.length > 1) throw new Error("只能连接 1 个视频节点");
    if (!audios.length) throw new Error("需要连接 1 个音频节点");
    if (audios.length > 1) throw new Error("只能连接 1 个音频节点");
    return { video: videos[0], audio: audios[0] };
}

export function buildSplitCommand() {
    return [
        "-i", "input.mp4",
        "-map", "0:v:0", "-c:v", "copy", "-an", "silent.mp4",
        "-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", "192k", "audio.m4a",
    ];
}

export function buildMergeCommand() {
    return [
        "-i", "video.mp4", "-i", "audio.m4a",
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-af", "apad", "-c:a", "aac", "-b:a", "192k",
        "-shortest", "output.mp4",
    ];
}

export function buildMergeTranscodeCommand() {
    return [
        "-i", "video.mp4", "-i", "audio.m4a",
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
        "-af", "apad", "-c:a", "aac", "-b:a", "192k",
        "-shortest", "output.mp4",
    ];
}

function hasReadableMedia(node: MediaInputNode) {
    return typeof node.metadata?.content === "string" || typeof node.metadata?.storageKey === "string";
}
