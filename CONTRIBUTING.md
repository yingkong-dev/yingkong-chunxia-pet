# 贡献指南

从 main 创建修复分支，通过 PR 提交。main 用于已验证集成，stable 指向已验证稳定基线；仅 RC 本地验证不等于正式稳定发布。禁止自动合并、强推主分支或自动删除分支。

提交前执行 npm test、npm run audit:public 和 Windows 构建。涉及播放/通知/显示时补充实际桌面测试，列出 MANUAL REQUIRED。不要上传个人配置、认证、会话或生成日志，不改正式视频来修复程序问题。

依赖更新由 Dependabot 提 PR，测试和人工审查后合并。Codex 可以分析问题、准备分支、测试与草稿 PR；不能自行合并、发布正式版本或变更公开权限。云端 AI 审查默认未启用。

## 报告问题与本地开发

Bug 请提供版本、Windows 版本、操作步骤、预期效果、实际结果和是否稳定复现。截图遮挡个人信息；不要提交认证、完整会话或内部日志。功能建议说明使用场景，无需提交账号信息。

在 Windows 安装 Node.js 24.19.0 后执行 `npm ci --ignore-scripts`、`npm test`、`npm run build`。播放相关变更执行实际桌面 smoke；素材验证需要独立 QA 的 Python/FFmpeg，不是日常运行依赖。PR 说明变更原因、验证范围和未测项；尽量一次只解决一个问题。
