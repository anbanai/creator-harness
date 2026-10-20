---
name: moneyprinter-turbo
description: Use when a managed 素材混剪 task must run the pinned MoneyPrinterTurbo CLI against user-provided local assets.
---

# MoneyPrinterTurbo 执行约定

只使用镜像内固定版本的官方 CLI 和任务私有 `MPT_HOME`。Agent 通过镜像提供的 `/usr/local/bin/local-life-mpt` bridge 调用它，不直接拼接上游命令或启动 WebUI/常驻 API。Bridge 输入必须显式设置 `video_source=local`、`video_count`、比例、共用脚本和本地素材；不得启用远程素材搜索或自动发布。

Bridge 会调用上游 `preprocess_video`：视频素材直接校验，图片素材会先生成带缓慢放大效果的 MP4 片段，再进入混剪。素材不足允许重复使用，但要在批次清单和质量报告中记录。

解析 CLI JSON、退出码和实际媒体文件，规范化到 `output/videos/001.mp4` 等路径，并把重复素材、失败阶段、请求数量和成功数量写入 `output/batch-manifest.json` 与 `output/quality-report.json`。
