import type { ApiCallFormat, ModelCapability } from "@/stores/use-config-store";

export type ModelProfile = {
    id: string;
    label: string;
    provider: ApiCallFormat;
    capabilities: ModelCapability[];
    alibbitFamily?: "banana2" | "gptimage2";
};

export const builtinModelProfiles: ModelProfile[] = [
    { id: "alibbit-banana2", label: "Banana 2", provider: "alibbit", capabilities: ["image"], alibbitFamily: "banana2" },
    { id: "alibbit-gptimage2", label: "GPT Image 2", provider: "alibbit", capabilities: ["image"], alibbitFamily: "gptimage2" },
    { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", provider: "alibbit", capabilities: ["image"] },
    { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image Preview", provider: "alibbit", capabilities: ["image"] },
    { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image Preview", provider: "alibbit", capabilities: ["image"] },
    { id: "seedream-4-0", label: "KIE Seedream 4.0", provider: "kie", capabilities: ["image"] },
    { id: "bytedance/seedance-2", label: "KIE Seedance 2", provider: "kie", capabilities: ["video"] },
    { id: "bytedance/seedance-2-fast", label: "KIE Seedance 2 Fast", provider: "kie", capabilities: ["video"] },
    { id: "bytedance/seedance-2-mini", label: "KIE Seedance 2 Mini", provider: "kie", capabilities: ["video"] },
    { id: "kling-2.6/motion-control", label: "KIE Kling 2.6 Motion Control", provider: "kie", capabilities: ["video"] },
    { id: "kling-3.0/motion-control", label: "KIE Kling 3.0 Motion Control", provider: "kie", capabilities: ["video"] },
];

export function builtinModelsForProvider(provider: ApiCallFormat) {
    return builtinModelProfiles.filter((profile) => profile.provider === provider).map((profile) => profile.id);
}

export function isBuiltinModelProvider(provider: ApiCallFormat) {
    return provider === "alibbit" || provider === "kie";
}

export function getBuiltinModelProfile(model: string) {
    return builtinModelProfiles.find((profile) => profile.id === model);
}
