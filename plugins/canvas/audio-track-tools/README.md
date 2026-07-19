# 视频音轨工具

Infinite Canvas 第三方节点插件，在浏览器本地使用 FFmpeg WASM 完成视频音轨分离与重新合并。

## 节点

- `分离视频音轨`：接收一个视频节点，输出一个无音轨视频节点和一个独立音频节点。
- `合并视频音轨`：接收一个视频节点和一个音频节点，输出成品视频节点；音频过长时截断，过短时补静音，保持完整视频时长。

## 本地开发

```bash
npm install
npm test
npm run typecheck
npm run build
```

构建产物包括：

```text
dist/audio-track-tools.js
dist/audio-track-tools/ffmpeg-worker.js
dist/audio-track-tools/ffmpeg-core.js
dist/audio-track-tools/ffmpeg-core.wasm
```

发布时必须保持主插件文件与 `audio-track-tools/` 资源目录的相对位置不变。处理过程不上传媒体文件；首次执行需要加载约 31 MB 的 FFmpeg WASM 资源。

## 许可

插件源码遵循项目许可；随插件分发的 `@ffmpeg/core` 使用 GPL-2.0-or-later，发布和再分发时需遵守对应许可。
