# video-creator

数据驱动的科普/获客短视频工厂：**内容写 JSON，引擎固化，一次出片。**

- 渲染：Edge (Playwright) + Canvas，逐帧 PNG → ffmpeg 编码 H.264/AAC MP4
- 配音：edge-tts 女声（`zh-CN-XiaoxiaoNeural`），按文案哈希缓存，改哪句才重做哪句
- 字幕：由配音时长自动分句 + 与语音对齐，无需手工排时间轴
- 配乐：脚本合成的柔和背景音乐，带自动闪避（说话时压低）
- 风格：`styles/*.json` 皮肤层，一套引擎多种视觉

## 目录

| 路径 | 作用 | 出新片要改吗 |
|---|---|---|
| `content/*.json` | **唯一内容入口**：分镜文案 / 版式选择 / 素材 / 卡片文字 / 配色覆盖 | ✅ 只改这里 |
| `styles/*.json` | 皮肤：主题色 + 卡片/字幕/HUD 等视觉 token | 换风格时 |
| `engine/engine.js` | 固化引擎：9 套版式模板 + 转场 + 字幕 + HUD，**代码内零文案** | ❌ |
| `engine/render.html` | 渲染入口 | ❌ |
| `engine/content.js` | **生成物**：内容 + 皮肤 + 时间轴的合并结果，渲染时读取（`build_content.py` 产出） | ❌ |
| `src/assets/*.svg` | 人物插画（unDraw, MIT） | 换素材时 |
| `src/timeline.js` | **生成物**：自动生成的时间轴 | ❌ |
| `scripts/` | 管线与校验脚本 | ❌ |
| `bootstrap.ps1` | **新环境一句话开工**：装依赖 → 出片 → 校验 | ❌ |
| `install_deps.ps1` | 把依赖装进项目内 `deps\`（跑一次，之后免配环境变量） | ❌ |
| `setenv.ps1` | 复用已有依赖时，一键配好 `PYTHONPATH` / `NODE_PATH` | ❌ |
| `run.ps1` | 一键出片 | ❌ |
| `tts/` | **生成物**：配音 mp3 + 时长缓存 | ❌ |
| `out/` | **生成物**：渲染帧与成片 | ❌ |
| `docs/` | 提示词、版式说明、流程、踩坑记录 | — |

> **生成物不进仓库**：`engine/content.js`、`timeline.json`、`src/timeline.js`、`tts/`、`out/`、`preview/`、`verify_frames/`、`audio.m4a`、`bgm.wav`
> 全部由脚本产出，已写进 `.gitignore`。clone 下来跑一次 `.\bootstrap.ps1`（或 `python scripts\build_content.py content\child-insurance.json`）即可重建。

## 快速开始

全新环境就一句（装依赖 → 出片 → 校验，全程免配环境变量）：

```powershell
.\bootstrap.ps1 -Name "给孩子买保险-科普短片"
```

想分步控制，或者复用机器上已有的依赖：

```powershell
# 0) 依赖：第一次跑一次，装进项目内 deps\；已有依赖就改成  . .\setenv.ps1
.\install_deps.ps1

# 1) 内容 -> 时间轴 + 按需配音
python scripts\build_content.py content\child-insurance.json

# 2) 逐帧渲染（默认输出 out/frames）
node scripts\render_frames.js png

# 3) 编码成片（输出 out/<OUT_NAME>.mp4）
$env:OUT_NAME = "给孩子买保险-科普短片"
python scripts\encode.py
```

或直接用一键脚本（会自动补做配乐与混音，并检查依赖）：

```powershell
.\run.ps1 -Name "给孩子买保险-科普短片"     # 完整出片
.\run.ps1 -PreviewOnly                      # 只抽 6 帧预览，几十秒
.\run.ps1 -SkipRender -Name 二次编码         # 复用 out\frames，只重编码
```

`run.ps1` 参数：`-Content` 内容文件、`-Name` 成片名、`-Python` / `-Node` 可执行文件路径。

`bootstrap.ps1` 参数：`-Name` 成片名、`-PreviewOnly` 只抽 6 帧预览、`-SkipInstall` / `-SkipVerify` / `-SkipRender` 分别跳过安装 / 校验 / 渲染，`-DryRun` 只打印命令，`-PipIndexUrl` / `-NpmRegistry` 换国内镜像。

> 依赖放哪儿？两条路，任选：
> - **推荐**：`.\install_deps.ps1` 把依赖装进项目内 `deps\`，从此不用再配环境变量（`deps\` 已 gitignore）。
>   想看它到底跑什么先加 `-DryRun`；国内网络慢可以 `-PipIndexUrl` / `-NpmRegistry` 换镜像。
> - **复用已有的**：`. .\setenv.ps1`（注意开头那个点）。它按 `-PythonPath` 参数 → 项目内 `deps\pylibs` → 已设的 `PYTHONPATH` → 常见缓存目录
>   的顺序探测，并且**真的 import 一次**验证（还会查 `imageio_ffmpeg.get_ffmpeg_exe` 这类关键属性，防"装了个半成品"）——验过了才设变量，坏了会被标红。
> - 两个都不跑也行：`run.ps1` 检测到环境变量没配会自动加载 `setenv.ps1`。

## 换风格

改 `content/*.json` 里的 `meta.style`：

```json
{ "meta": { "style": "dark" } }
```

当前内置：

| style | 说明 |
|---|---|
| `warm` | 暖阳插画风（默认）：米白底 + 暖橙/珊瑚/薄荷，柔和不刺眼 |
| `dark` | 深色科技风：深蓝底 + 霓虹强调色，卡片为深色玻璃，光斑更亮 |

同一份文案切 `style` 即可产出两种视觉，排版/动效/时长完全一致。

## 换选题

复制一份 `content/child-insurance.json`，改 `narration` 文案和各版式的字段即可。
`narration` 一变，配音自动重做，时间轴自动重算——**不需要手工调任何时间**。

## 校验

| 脚本 | 作用 |
|---|---|
| `scripts/sync_check.py` | 每段解说起音点 vs 时间轴（音画同步） |
| `scripts/layout_probe.js` | 逐帧测量文本 bbox 与插画矩形，检出重叠/越界 |
| `scripts/check_contrast.py` | 按皮肤算 WCAG 对比度，抓"看不清"的配色 |
| `scripts/diff_frames.js` | 两版帧逐像素回归比对 |
| `scripts/ocr_all.js` | 成片文字 OCR 校验 |

## 许可

- 插画：unDraw（MIT），来源见 `src/assets/_provenance.json`
- 配音：edge-tts（本地调用微软公开接口，注意使用条款）
- 字体：微软雅黑 / 苹方（系统字体，未随项目分发）
