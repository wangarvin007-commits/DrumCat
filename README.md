# DrumCat

DrumCat 是一个本地运行的跨平台桌宠，使用 Tauri、Vue 3 和 Rust 构建。主窗口透明、无边框并可置顶，支持多风格猫狗皮肤、键鼠互动、自动睡眠、对话、专注计时、系统提醒、托盘菜单、快捷键和设置持久化。对话面板采用紧凑窗口，打开时不会生成大面积透明置顶区域，关闭后会恢复桌宠原尺寸和原位置。

完整的对外产品介绍和逐项功能清单见 [`产品文案.md`](产品文案.md)。

## 下载

- Windows 10/11 x64 安装程序：[下载 EXE](https://github.com/wangarvin007-commits/DrumCat/releases/download/v0.1.2/DrumCat_0.1.2_Windows_x64_setup.exe)
- macOS Apple Silicon 安装镜像：[下载 DMG](https://github.com/wangarvin007-commits/DrumCat/releases/download/v0.1.2/DrumCat_0.1.2_aarch64.dmg)
- macOS Apple Silicon 应用压缩包：[下载 ZIP](https://github.com/wangarvin007-commits/DrumCat/releases/download/v0.1.2/DrumCat_0.1.2_macOS_arm64.zip)
- 全部版本与更新说明：[GitHub Releases](https://github.com/wangarvin007-commits/DrumCat/releases)

Windows 安装包当前未购买代码签名证书，首次安装时 Windows Defender SmartScreen 可能显示“未知发布者”，请选择“更多信息 → 仍要运行”。macOS 发布包使用 ad-hoc 签名，尚未进行 Apple 公证；首次启动时如被 macOS 拦截，可右键应用并选择“打开”。

各安装包的 SHA-256 以对应 GitHub Release 中公布的校验值为准。

## MVP 功能

- 透明、无边框、置顶桌面窗口
- 拖动、缩放、隐藏、窗口穿透与透明度设置
- 自动眨眼、待机、睡觉与点击唤醒
- 全局键盘输入触发挥爪动作
- 鼠标注视、点击跳跃和右键菜单
- 本地规则对话，以及可选的多厂商 AI 流式对话与图片理解
- OpenAI、Anthropic Claude、Gemini、DeepSeek、通义千问、Kimi、智谱、硅基流动、OpenRouter、Azure、Ollama、LM Studio 和自定义兼容接口预设
- 可配置桌宠名字、主人名字、长期职责、当前目标和偏好；这些信息会组成内置身份指令
- API 请求通过 Rust 原生网络层发送并支持测试连接；密钥只在运行内存中跨窗口同步
- 回复驱动动作、表情、文字气泡和睡眠
- 专注计时、自动休息、待办、定时提醒和原生系统通知
- 陪伴、专注、安静、会议、游戏和直播 / OBS 模式
- 可配置键鼠动作、主动消息上限和本地记忆
- 托盘菜单、全局快捷键和设置面板
- 英短“奶盖”、柴犬“栗子”和线条小狗“小金毛”三套 v2 全动作皮肤
- 衣橱与设置页内置“定制专属皮肤”入口，可扫码联系 Arvin
- 每套皮肤包含 9 类动作、自动眨眼与 16 方向鼠标注视；旧版临时皮肤已移除

## 定制专属皮肤

衣橱最下方提供定制入口。点击后可查看完整二维码，联系 Arvin 沟通猫猫、狗狗或原创角色皮肤。

<img alt="Arvin 微信二维码" src="public/custom-skin/arvin-wechat.jpg" width="260">

macOS 的跨应用键盘和鼠标互动需要在“系统设置 → 隐私与安全性 → 输入监控”中授权 DrumCat。Windows 安装包通过 GitHub Actions 的 Windows x64 环境完成原生编译、WebDriver UI 回归、NSIS 静默安装和安装后启动检查。

远程自由对话和图片理解需要用户自行配置 API。DrumCat 原生支持 Anthropic Messages，并兼容 OpenAI Chat Completions 生态；其他兼容服务可填写完整接口地址、模型、协议和鉴权请求头。不开启 API 时，本地聊天、指令、番茄钟、提醒、任务、动作和全部桌面互动仍可使用。所有提醒只通过文字气泡与系统文字通知呈现。

## 默认快捷键

- 显示/隐藏桌宠：`Cmd/Ctrl + Shift + D`
- 显示/隐藏设置：`Cmd/Ctrl + Shift + P`
- 显示/隐藏对话：`Cmd/Ctrl + Shift + C`
- 镜像模式：`Cmd/Ctrl + Shift + M`
- 窗口穿透：`Cmd/Ctrl + Shift + X`
- 窗口置顶：`Cmd/Ctrl + Shift + T`

## 本地开发

```bash
pnpm install
pnpm tauri dev
```

构建当前平台安装包：

```bash
pnpm tauri build
```

运行本地功能验收：

```bash
pnpm typecheck
pnpm lint:check
pnpm test:mvp
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy -p drum-cat -- -D warnings
```

## 开源说明

本项目基于 MIT 许可的 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) 改造，并参考了 [Petdex](https://github.com/crafter-station/petdex) 等开源桌宠项目的状态与交互思路。当前内置宠物图集为 DrumCat 原创素材；说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
