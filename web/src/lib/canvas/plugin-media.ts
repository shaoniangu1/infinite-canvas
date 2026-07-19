import type { CanvasPluginMedia } from "@/types/canvas-plugin";
import type { UploadedFile } from "@/services/file-storage";

type PluginMediaDependencies = {
    getMediaBlob: (storageKey: string) => Promise<Blob | null>;
    uploadMediaFile: (blob: Blob, prefix: string) => Promise<UploadedFile>;
    deleteStoredMedia: (keys: Iterable<string>) => Promise<void>;
    fetchBlob: (url: string) => Promise<Blob>;
};

export function createPluginMedia(dependencies: PluginMediaDependencies): CanvasPluginMedia {
    return {
        read: async ({ storageKey, url }) => {
            if (storageKey) {
                const blob = await dependencies.getMediaBlob(storageKey);
                if (blob) return blob;
            }
            if (url) {
                try {
                    return await dependencies.fetchBlob(url);
                } catch {
                    // Fall through to the stable user-facing error below.
                }
            }
            throw new Error("媒体文件读取失败，请重新上传或恢复原始素材");
        },
        save: (blob, prefix = "plugin-media") => dependencies.uploadMediaFile(blob, prefix),
        remove: (storageKey) => dependencies.deleteStoredMedia([storageKey]),
    };
}
