import { type ReactNode } from "react";
import { ConfigProvider } from "antd";

import { type CanvasTheme } from "@/lib/canvas-theme";
import { IMAGE_ASPECT_RATIOS, imageAspectRatioLabel, imageQualityLabel as formatImageQualityLabel, imageResolutionLabel, normalizeAspectRatio, normalizeImageQuality, normalizeImageResolution } from "@/services/ai/image-settings";
import type { AiConfig } from "@/stores/use-config-store";

const qualityOptions = [
    { value: "low", label: "低画质" },
    { value: "medium", label: "标准画质" },
    { value: "high", label: "高画质" },
];

const resolutionOptions = [
    { value: "1k", label: "1K" },
    { value: "2k", label: "2K" },
    { value: "4k", label: "4K" },
];

const countOptions = [1, 2, 4];

export const imageQualityOptions = qualityOptions.map((item) => ({ value: item.value, label: item.label }));
export const imageResolutionOptions = resolutionOptions.map((item) => ({ value: item.value, label: item.label }));
export const imageAspectOptions = IMAGE_ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }));

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "quality" | "resolution" | "size" | "count", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    maxCount?: number;
    quickCount?: number;
};

export function ImageSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-full space-y-2.5 rounded-2xl px-1 py-0.5" }: ImageSettingsPanelProps) {
    const quality = normalizeImageQuality(config.quality);
    const resolution = normalizeImageResolution(config.resolution);
    const activeAspect = normalizeAspectRatio(config.size);
    const count = Math.max(1, Math.floor(Math.abs(Number(config.count)) || 1));

    return (
        <ImageSettingsTheme theme={theme}>
            <div
                className={className}
                style={{ color: theme.node.text }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    if (document.activeElement instanceof HTMLElement && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
                }}
            >
                {showTitle ? <div className="text-sm font-semibold">图像设置</div> : null}
                <div className="space-y-1.5">
                    <SettingTitle color={theme.node.muted}>画质</SettingTitle>
                    <div className="grid grid-cols-3 gap-1.5">
                        {qualityOptions.map((item) => (
                            <OptionPill key={item.value} selected={quality === item.value} theme={theme} onClick={() => onConfigChange("quality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <SettingTitle color={theme.node.muted}>清晰度</SettingTitle>
                    <div className="grid grid-cols-3 gap-1.5">
                        {resolutionOptions.map((item) => (
                            <OptionPill key={item.value} selected={resolution === item.value} theme={theme} onClick={() => onConfigChange("resolution", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <SettingTitle color={theme.node.muted}>比例</SettingTitle>
                    <div className="grid grid-cols-5 gap-1.5">
                        {IMAGE_ASPECT_RATIOS.map((ratio) => (
                            <AspectButton key={ratio} ratio={ratio} selected={activeAspect === ratio} theme={theme} onClick={() => onConfigChange("size", ratio)} />
                        ))}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <SettingTitle color={theme.node.muted}>生成数量</SettingTitle>
                    <div className="grid grid-cols-3 gap-1.5">
                        {countOptions.map((value) => (
                            <OptionPill key={value} selected={count === value} theme={theme} onClick={() => onConfigChange("count", String(value))}>
                                {value}张
                            </OptionPill>
                        ))}
                    </div>
                </div>
            </div>
        </ImageSettingsTheme>
    );
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: { Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text } },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function imageQualityLabel(value: string) {
    return formatImageQualityLabel(value);
}

export function imageSizeLabel(size: string) {
    return imageAspectRatioLabel(size);
}

export { imageResolutionLabel };

function OptionPill({ selected, theme, onClick, children }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    const style = optionStyle(selected, theme);
    return (
        <button
            type="button"
            className="h-7 cursor-pointer rounded-md border px-2 text-xs transition hover:opacity-80"
            style={style}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function AspectButton({ ratio, selected, theme, onClick }: { ratio: string; selected: boolean; theme: CanvasTheme; onClick: () => void }) {
    const style = optionStyle(selected, theme);
    return (
        <button
            type="button"
            className="flex h-[52px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border bg-transparent text-[11px] transition hover:opacity-80"
            style={style}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            <AspectIcon ratio={ratio} color={style.color} />
            <span>{ratio}</span>
        </button>
    );
}

function optionStyle(selected: boolean, theme: CanvasTheme) {
    return {
        background: selected ? theme.toolbar.activeBg : "transparent",
        borderColor: selected ? theme.node.text : theme.node.stroke,
        color: selected ? theme.node.text : theme.node.placeholder,
    };
}

function AspectIcon({ ratio, color }: { ratio: string; color: string }) {
    const [width, height] = ratio.split(":").map(Number);
    const value = width / Math.max(1, height);
    const boxWidth = value >= 1 ? 16 : Math.max(6, 16 * value);
    const boxHeight = value >= 1 ? Math.max(6, 16 / value) : 16;
    return (
        <span className="grid h-5 w-7 place-items-center">
            <span className="rounded-[2px] border" style={{ width: boxWidth, height: boxHeight, borderColor: color }} />
        </span>
    );
}

function SettingTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-[11px] font-medium" style={{ color }}>
            {children}
        </div>
    );
}
