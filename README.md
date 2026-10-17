# 莺空社区 · 春夏桌宠

基于 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 二次开发的 Windows 透明桌宠。当前为待发布候选版，不是上游官方版本。

保留随机待机、点击回应、Codex 状态联动、账号额度、随机气泡、Windows 通知、系统音频待机、动作管理、镜像、尺寸与脚底固定的通透模式。无需购买 API，不附带任何账号或凭证。

## 安装与运行

支持 Windows 10/11 x64；实际验证平台见构建报告。下载项目 Release 中的便携压缩包，完整解压到可写目录（支持中文与空格），双击 **启动春夏桌宠.bat**。不要只提取 exe。右键可设置、退出；也可运行 **停止春夏桌宠.bat**。包未签名，尚不提供安装器。

源码 ZIP 不包含 Node/Electron 和构建产物，不能直接双击运行。源码开发需安装 Node.js 24.19.0（含 npm）、Windows .NET Framework C# 编译器，然后在项目目录执行：

```powershell
npm ci --ignore-scripts
npm test
npm run build
```

构建结果在 dist/yingkong-chunxia-pet-win-x64。依赖版本由根目录及官方宿主 package-lock.json 固定；构建会下载官方 Electron 43.8.0。无需全局 Python 运行桌宠。Python 与 FFmpeg 仅用于素材验证，不随日常运行启动。

## 首次配置与隐私

Codex 监听、额度查询和系统音频监听默认关闭，请在菜单按需开启。用户配置位于 `%LOCALAPPDATA%/Yingkong/ChunxiaPet`，升级保留设置；不向项目源码目录写账号数据。Windows 通知会注册当前用户的应用身份和快捷方式，不需要管理员权限。

Codex 功能使用用户本机实际安装并登录的客户端。额度通过官方 app-server 只读查询，账号切换重新核验，不创建模型任务；API Key 模式或身份不一致不冒充订阅额度。可用性取决于 Codex 版本、本地认证与网络。状态监听只展示已有可靠事件，不能区分的状态不会猜测成工具、审批或成功。音频仅分析默认输出音量，不监听麦克风、不存录音、不上传。

没有 Codex 也能正常使用桌宠。不要向 Issue 上传认证文件、完整会话、日志正文或个人路径。诊断先脱敏。

## 动作

8 条透明 VP9 WebM，640×360、24fps。待机01/02/03 为随机池；点击回应、任务开始、工作中、任务完成、音乐待机各有独立用途。旧动作不随公开候选分发，运行时不回退旧素材。自定义动作通过“09-桌宠集成/动作配置/动作清单.json”及 assets-manifest.json 管理，正式资源校验失败时明确停止。

## 许可与贡献

代码 MIT；春夏动画 CC BY-NC 4.0（允许二创，禁止商用），见 [NOTICE.md](NOTICE.md)。未附带原版角色素材或未获授权字体，因此字体可能与开发者本机版本略有不同。

安装、发布和维护说明见 docs；问题和贡献见 CONTRIBUTING.md 与 SECURITY.md。自动测试通过不等于视觉或用户验收通过。当前远程 CI、首次 GitHub 推送及正式 Release 均须在发布授权后完成。
