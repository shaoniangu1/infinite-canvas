import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");
const kiePreviewPath = resolve(tmpdir(), "infinite-canvas-kie-request-preview.json");

// 暴露 /plugins/index.json:列出 public/plugins 下的本地插件文件,
// 供前端自动发现并加入插件列表(默认关闭)。dev 下实时读目录,构建时产出静态清单。
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

function kieRequestPreviewCapture(): Plugin {
    return {
        name: "kie-request-preview-capture",
        configureServer(server) {
            server.middlewares.use("/__debug/kie-request-preview", (req, res) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    return res.end();
                }
                let body = "";
                req.setEncoding("utf8");
                req.on("data", (chunk) => { body += chunk; });
                req.on("end", () => {
                    try {
                        writeFileSync(kiePreviewPath, JSON.stringify(JSON.parse(body), null, 2), "utf8");
                        res.setHeader("Content-Type", "application/json");
                        res.end('{"saved":true}');
                    } catch {
                        res.statusCode = 400;
                        res.end('{"saved":false}');
                    }
                });
            });
        },
    };
}

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [react(), localPluginsManifest(), kieRequestPreviewCapture()],
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
});
