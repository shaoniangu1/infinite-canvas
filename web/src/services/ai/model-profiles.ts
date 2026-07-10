import type { ApiCallFormat, ModelCapability } from "@/stores/use-config-store";

export type ModelProfile = {
    id: string;
    label: string;
    provider: ApiCallFormat;
    capabilities: ModelCapability[];
};

const alibbitAspects = ["1:1", "16:9", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "21:9"];
const alibbitQualities = ["1k", "2k", "4k"];

export const builtinModelProfiles: ModelProfile[] = [
    ...alibbitAspects.flatMap((aspect) =>
        alibbitQualities.flatMap((quality) => [
            { id: `ali-banana2-${aspect}-${quality}`, label: `Banana 2 ${aspect} ${quality}`, provider: "alibbit" as const, capabilities: ["image" as const] },
            { id: `ali-gptimage2-${aspect}-${quality}`, label: `GPT Image 2 ${aspect} ${quality}`, provider: "alibbit" as const, capabilities: ["image" as const] },
        ]),
    ),
    { id: "ali-banana2-autoaspect-1k", label: "Banana 2 自动比例 1k", provider: "alibbit", capabilities: ["image"] },
    { id: "ali-banana2-autoaspect-2k", label: "Banana 2 自动比例 2k", provider: "alibbit", capabilities: ["image"] },
    { id: "ali-banana2-autoaspect-4k", label: "Banana 2 自动比例 4k", provider: "alibbit", capabilities: ["image"] },
    { id: "ali-gptimage2-auto-1k", label: "GPT Image 2 自动比例 1k", provider: "alibbit", capabilities: ["image"] },
    { id: "ali-gptimage2-auto-2k", label: "GPT Image 2 自动比例 2k", provider: "alibbit", capabilities: ["image"] },
    { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", provider: "alibbit", capabilities: ["image"] },
    { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image Preview", provider: "alibbit", capabilities: ["image"] },
    { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image Preview", provider: "alibbit", capabilities: ["image"] },
    { id: "seedream-4-0", label: "KIE Seedream 4.0", provider: "kie", capabilities: ["image"] },
    { id: "kling-2.6/motion-control", label: "KIE Kling 2.6 Motion Control", provider: "kie", capabilities: ["video"] },
    { id: "kling-3.0/motion-control", label: "KIE Kling 3.0 Motion Control", provider: "kie", capabilities: ["video"] },
];

export function builtinModelsForProvider(provider: ApiCallFormat) {
    return builtinModelProfiles.filter((profile) => profile.provider === provider).map((profile) => profile.id);
}

export function getBuiltinModelProfile(model: string) {
    return builtinModelProfiles.find((profile) => profile.id === model);
}
