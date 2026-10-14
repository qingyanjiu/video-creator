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
| `run.ps1` | 一键出片（Windows） | ❌ |
| `scripts/pipe.py` | 一键出片的跨平台版（mac / Linux / Windows 都能跑） | ❌ |
| `.claude/skills/new-video/` | 让 Claude Code 直接出片：问需求 → 逐项确认 → 生成 → 抽帧确认 → 出片 | ❌ |
| `tts/<slug>/` | **生成物**：配音 mp3 + 时长缓存（按片名分目录，见下） | ❌ |
| `out/` | **生成物**：渲染帧与成片 | ❌ |
| `docs/` | 提示词、版式说明、流程、踩坑记录 | — |

> **生成物不进仓库**：`engine/content.js`、`timeline.json`、`src/timeline.js`、`tts/`、`out/`、`preview/`、`verify_frames/`、`audio.m4a`、`bgm.wav`
> 全部由脚本产出，已写进 `.gitignore`。clone 下来跑一次 `.\bootstrap.ps1`（或 `python scripts\build_content.py content\child-insurance.json`）即可重建。

> **配音缓存按 `meta.slug` 分目录**（`tts/child-insurance/`、`tts/binary-basics/`…），不能共用一层。
> mp3 的文件名就是镜号（`s1.mp3`），而每部片子的镜号都从 `s1` 起——共用一个目录时，
> 「构建 B」会把「A 的 s1–s5」覆盖成 B 的配音，下次构建 A 全部重做。
> 更要命的是 edge-tts 的时长**不可复现**（同一句话连做两次能得 2.140s 和 2.160s），
> 所以重做不只是费时间：**A 的时间轴会凭空变**（实测从 15.433s 漂到 16.767s）。
> 想彻底复现一条片子，靠的是别删 `tts/<slug>/`，而不是指望重新合成能得到同样的时长。

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

### macOS / Linux

上面的 `run.ps1` / `setenv.ps1` / `bootstrap.ps1` 是 PowerShell 专用。非 Windows 用 `scripts/pipe.py`——
它自己配好 `deps/venv`、`deps/node_modules`、`RENDER_HTML`，和 `run.ps1` 的步骤顺序一致：

```bash
python3 scripts/pipe.py check                                    # 依赖自检
python3 scripts/pipe.py preview content/child-insurance.json --times auto
python3 scripts/pipe.py all content/child-insurance.json --name "给孩子买保险-科普短片"
```

`--times auto` 会从 `timeline.json` 每镜取一点（解说进行到 65% 处，元素都已落位），抽 6 帧铺满全片。
要单独看某一镜就传秒数：`--times 14.7,40.4`。子命令还有 `build` / `render` / `audio` / `encode`，可以分步跑。

### 让 Claude Code 出片

仓库里带了 skill `.claude/skills/new-video/`。在项目里对 Claude Code 说"做一条关于 X 的科普视频"，
它会读 `content/schema.json`，把主题、品牌胶囊、免责声明、配色、音色问清楚，起草 9 镜分镜给你改，
落成 `content/<slug>.json`，跑校验，**抽 6 帧给你看过之后**才做全量渲染。

## 能配什么

**唯一真相是 [content/schema.json](content/schema.json)**：每个字段的必填/选填、类型、取值范围、默认值都在里面。
`scripts/build_content.py` 按它校验，写错会直接报错并指出位置——`tpl` 拼错、插画名打错、色名写错这类，
以前都是**悄悄画错**不报错的。

| 层 | 配什么 | 入口 |
|---|---|---|
| 内容 | 分镜文案、版式、素材、卡片文字 | `content/*.json` 的 `scenes` |
| 节奏强度 | 每镜 `high`（重音）/ `low`（过渡，不闪不抖） | 每镜的 `energy` |
| 配色 | 主题色 + 卡片/字幕/HUD 色板 | `meta.style`，或 `theme` 单项覆盖 |
| 节奏 | 每镜留白、转场时长、撞击闪光 | `meta.pace` |
| 帧率 | 整片帧率 | `meta.fps` |
| 配音 | 音色、语速 | `meta.voice` / `meta.rate` |
| 输出 | 目录、文件名 | `OUT_DIR` / `OUT_NAME` 环境变量 |

**插画是可选的。** 七个原本必填 `asset` 的版式都有一条无插画分支：把 `asset` 键整个删掉，
版式会在同一位置画一个几何母题（同心圈 / 堆叠方块 / 开关 / 圆盘 / 递增柱）。`assets` 也能整份省略。
说一句"这条片子不放插画"就行——版面、拍点、时长都不变。详见 [docs/02](docs/02-版式与风格.md)。

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
| `tech` | 深空科技风：更深的底 + 点阵网格/扫描线背景层 + 发光，数字用等宽字体 |

同一份文案切 `style` 即可产出三种视觉，排版/动效/时长完全一致。

## 换帧率

`content/*.json` 里的 `meta.fps`，默认 30：

```json
{ "meta": { "fps": 24 } }
```

改完要重跑 `build_content.py`（它按这个值算总帧数）再渲染。30 → 24 省 20% 渲染时间和体积，
但 **24 是下限**——再低，卡片落位的抖动（约 4.8Hz）会明显发抖。详见 [docs/02](docs/02-版式与风格.md)。

> 注意：降帧率省的是渲染时间和磁盘，**不是 token**。渲染/编码是本地 Playwright + ffmpeg，不经过模型。

## 换节奏

`content/*.json` 里的 `meta.pace`，五项都是秒，不写就用默认值：

```json
{ "meta": { "pace": { "lead": 0.3, "tail": 0.36, "lastTail": 1.2, "transition": 0.45, "flash": 0.11 } } }
```

| 项 | 含义 | 默认 |
|---|---|---|
| `lead` | 每镜配音**前**的留白，徽标与大标题在这段里落位 | 0.30 |
| `tail` | 配音后的余量（除最后一镜）。**「太赶」优先加它**——直接买到画面静止时间 | 0.36 |
| `lastTail` | 最后一镜配音后的余量，给收尾留时间 | 1.20 |
| `transition` | 相邻两镜的混合窗口宽度，花样按进镜版式自动选。**写 0 = 硬切** | 0.45 |
| `flash` | 每镜主体开始落位时叠的一层全屏强调色。**写 0 = 关闭** | 0.11 |

前四项**只改时长、不改画面**，是「利落版 / 从容版」最便宜的开关。`lead` 从 0.30 提到 0.60 会多出约 2.7 秒——
渲染帧数和成片长度都跟着变，但要重跑 `build_content.py`。

后两项**改画面**：它们决定切镜时观众看到什么。`transition: 0` + `flash: 0` 就是最干净的一档——
镜头直接换，不叠不加。适合信息密度高、想让画面完全为内容让路的片子；反过来，
`transition: 0.45` + `flash: 0.11` 更有「撞一下」的节奏感，适合情绪向的钩子。

### 觉得「太赶、还没看清就过去了」？

先看清楚**不是**总时长的问题，是"画面齐全且停住"的时间太短。引擎的离场窗口长度是
`min(clamp(dur*0.18, 0.35, 0.80), max(0.30, tail*0.45))`——第二项保证它待在 `tail` 里，
不啃进解说。所以**加 `tail` 就直接买到静止时间**：

```json
{ "meta": { "rate": "+0%", "pace": { "lead": 0.45, "tail": 1.2, "transition": 0, "flash": 0 } } }
```

这是《二进制》那套「教学片节奏」：`tail` 从 0.36 提到 1.2，每镜解说后多留 0.84s 画面不动；
`lead` 提到 0.45 让画面先齐再开口；`rate` 从 `+8%` 降到 `+0%` 让配音本身慢下来。
一条 5 镜 17s 的片子会变成 22s。

> 改 `meta.rate` / `meta.voice` 会让**全部配音重做**（缓存 key 含音色与语速）。
> 而且 edge-tts 的时长不可复现——重做后每镜时长会有几十毫秒的漂移，整条时间轴跟着变，
> 这是预期的，不是 bug。想复现一条旧片，靠的是别删 `tts/<slug>/`。

## 换选题

复制一份 `content/child-insurance.json`，改 `narration` 文案和各版式的字段即可。
`narration` 一变，配音自动重做，时间轴自动重算——**不需要手工调任何时间**。

## 校验

`build_content.py` 出片前先按 `content/schema.json` 校验内容，字段写错会直接报错并指出位置。
其余脚本按需跑：

| 脚本 | 作用 |
|---|---|
| `scripts/sync_check.py` | 每段解说起音点 vs 时间轴（音画同步） |
| `scripts/layout_probe.js` | 逐帧测量文本 bbox 与插画矩形，检出重叠/越界 |
| `scripts/check_contrast.py` | 按皮肤算 WCAG 对比度，抓"看不清"的配色 |
| `scripts/diff_frames.js` | 两版帧逐像素回归比对 |
| `scripts/motion_check.js` | 每镜尾部窗口的"画面动能量"，抓元素落位后冻住的静帧 |
| `scripts/ocr_all.js` | 成片文字 OCR 校验 |

## 许可

- 插画：unDraw（MIT），来源见 `src/assets/_provenance.json`
- 配音：edge-tts（本地调用微软公开接口，注意使用条款）
- 字体：微软雅黑 / 苹方（系统字体，未随项目分发）
