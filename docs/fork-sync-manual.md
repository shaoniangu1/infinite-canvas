# Fork 二开与官方同步手册

当前仓库远程：

```bash
origin   https://github.com/shaoniangu1/infinite-canvas.git
upstream https://github.com/basketikun/infinite-canvas.git
```

`origin` 是你的 fork，用于保存二开代码；`upstream` 是官方仓库，只用于拉取更新。已禁用 `upstream` 的 push 地址，避免误推官方。

## 分支约定

- `main`：尽量保持接近官方主线，不直接做二开。
- `dev/local`：本地二开主分支，日常开发从这里开始。
- `feature/xxx`：较大的功能改动可从 `dev/local` 临时切出。

## 日常开发

```bash
git switch dev/local
git status
```

提交改动：

```bash
git add <files>
git commit -m "描述本次改动"
git push -u origin dev/local
```

## 拉取官方更新并合并到二开分支

```bash
git fetch upstream
git switch main
git merge upstream/main
git push origin main

git switch dev/local
git merge main
```

如有冲突，先打开冲突文件手动处理，再执行：

```bash
git add <resolved-files>
git commit
git push origin dev/local
```

## 启动本地环境

官方文档使用 Bun；本机未安装 Bun 时可用 npm：

```bash
cd web
npm install --legacy-peer-deps --no-package-lock
npx vite --host 0.0.0.0 --port 3002
```

本机约定访问：`http://localhost:3002`。
