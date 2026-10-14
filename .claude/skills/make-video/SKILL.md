---
name: make-video
description: 从零做一条竖版科普短视频——问主题、起草分镜、逐项确认配置、写 content/<slug>.json、跑校验、抽帧给用户确认、再全量渲染出片。当用户说"做一条关于 X 的视频""出片""帮我做条科普短视频""用这个引擎生成一条"时使用。
---

# 出一条片

## 先读这三份，别凭记忆

| 文件 | 用途 |
|---|---|
| `content/schema.json` | **配置面的唯一真相**。每个字段带 `label`（问用户时就用这个词）和 `desc`（约束、推荐值）。**每次现读，不要背字段清单**——加了新字段这里会自动多出来 |
| `content/child-insurance.json` | 一份填好的范本。产出的 JSON 要长得和它一模一样 |
| `styles/warm.json` `styles/dark.json` | 两套皮肤，知道名字就够了 |

## 铁律

- **不碰 `engine/`**。engine.js 是版式引擎；改它属于"改引擎"，不是"出片"。用户想要新版式、想调字幕位置，直说这超出本 skill 范围。
- **不碰 `content/child-insurance.json`**，那是已发布的成片。新片写新文件 `content/<slug>.json`。
- **校验必须过**（`build_content.py` 会一次列全所有错误）。写错字段时它会在跑 TTS 之前就退出，不会白等。
- **抽帧给用户看过之前，不要全量渲染。** 全量要 3～4 分钟，盲跑就是浪费。
- **时间字段永远不要问用户**：`chips[1]` / `tags[1]` / `items[1]` 里的"解说进度 0–1"，按 schema 的 `desc` 推荐值填。用户不知道也不该知道什么叫"解说进度"。
- 画面里的一切都必须是**用户看得懂的话**。`slug`、`id`、字段名这些是给机器的，不解释给用户听。

---

## 第 1 步 · 摸底（一条消息问完，别挤牙膏）

先用 AskUserQuestion 或者直接列问题，一次拿到这些：

| 问什么 | 落到哪 |
|---|---|
| 这条视频讲什么、想让观众记住哪一句 | 决定分镜骨架 |
| 给谁看（家长 / 新手 / 老人） | 决定用词深浅 |
| 顶部品牌胶囊写什么字 | `meta.brand`（必填） |
| 结尾的免责声明 | `meta.disclaimer`（必填；先给一个通用默认让他改） |
| 成片叫什么名字 | `meta.title` + `meta.slug`（slug 由标题转拼音或意译，如 `child-insurance`） |

摸底时顺手读一次 `content/schema.json` 的 `meta`，别问 schema 里已经有默认值的东西（`assetBase`、`fps`、`voice` 这些留到第 3 步按需确认）。

## 第 2 步 · 起草分镜，整表给用户看

默认骨架是 **9 镜 / 约 60 秒**，照 `content/child-insurance.json` 的排法：

| 镜 | tpl | 这一镜干什么 |
|---|---|---|
| s1 | `hook` | 开场钩子：一句扎心的话 + 大标题 + 弹窗雨（只放第 1 镜） |
| s2–s5 | `step` / `chips` / `split` / `bigNumber` | 四个要点，每个要点挑一个版式 |
| s6 | `pitfalls` | 三个坑（固定 3 条，不放插画） |
| s7 | `coins` | 附加项 / 储蓄类（没有就删掉这镜） |
| s8 | `funnel` | 结论排序（固定 5 级，不放插画） |
| s9 | `outro` | 结论口诀 + 关注引导 + 免责声明 |

**按内容裁剪**：只有三个要点就删到 7 镜；有六个要点就把 `step`/`chips`/`split` 多用几次（同一版式可以用多次，分镜顺序自由）。

**每镜挑 tpl 的方法**，从 schema 的 `scenes.tpl.<名>.desc` 读——那里写清了每套版式强调什么：

- 要突出**一个大数字**（"两三百块""保额 50 万"）→ `step` 或 `bigNumber`
- 只有**两条短信息**→ `chips`
- 讲**费用怎么分摊**（"医保报完剩下的"）→ `split`
- 讲**三条并列的反例**→ `pitfalls`
- 讲**先后顺序**→ `funnel`

挑完 tpl，该镜的必填字段就从 schema 里那一节读，一个不漏。

**给用户的草稿表长这样**（人话，不是 JSON）：

```
镜  版式        解说词                              画面要点
s1  开场钩子     给孩子买保险，顺序错了，钱就白花了。   大标题「给孩子买保险」/ 副题「别被推销带跑偏」/ 插画：妈妈抱娃
s2  大数字步骤   第一步，少儿医保，出生就去办……        卡头「少儿医保」/ 大字 200-300 元每年 / 条幅「国家福利…」
...
```

**一次给全，请用户圈改。** 逐项发问在这里没有意义——用户看整表才能判断"顺序对不对""重点对不对"。表里每一项都对应一个要写进 JSON 的值，所以这也是一次完整确认。

改完再改表，表定稿了才落 JSON。

### 追问时问什么

- 解说词（`narration`）：12–40 字，口语，别用书面词，别出现分号。schema 里写着 6–60 字是校验的硬边界，但 40 字以上配音会很长、字幕要换行到第 3 行。
- 相邻两镜**不要同一个 `accent`**（7 色轮着用）。
- `card.value` 这类"大字"控制在 8 个字符以内，超了会挤爆卡片。
- `popups` 用 schema 的 `desc` 里的推荐写法：位置 100–980 铺开，速度 0.8–1.3。

## 第 3 步 · 确认全局配置（一次问完，都是多选一）

这几项适合用 AskUserQuestion，**选项就从 schema 里读**（`meta.style.values`、`meta.fps`、`voices`、`meta.pace`）：

| 项 | 默认 | 什么时候要问 |
|---|---|---|
| `meta.style` | `warm` | 一直问。给两个选项的 `label`（暖阳插画风 / 深色） |
| `meta.voice` + `meta.rate` | 晓晓 / `+0%` | 一直问。**提醒：改这两项会让全部配音重做** |
| `meta.fps` | 30 | 别问。除非用户提了渲染太慢或文件太大，才给 24 |
| `meta.pace` | 全默认 | 别问。用户说"太赶/太拖"时才给档位 |

**节奏只在用户抱怨时才动**。默认那套（lead 0.30 / tail 0.36 / lastTail 1.20 / transition 0.45 / flash 0.11）是调过的，别自作主张。

## 第 4 步 · 写 JSON 并校验

写 `content/<slug>.json`，结构完全照 `content/child-insurance.json`——`meta` / `assets` / `scenes` 三块，不要多写 `theme`（除非用户明确说要单片微调颜色，那才加顶层 `theme`，键从 schema 的 `colors.themeKeys` 里选）。

`assets` 直接复用现有的 7 张插画（`ls src/assets/*.svg` 看有哪些），每张在新片里都要重新列一遍 `{name, file}`。**没有合适的插画不要自己造**——插画现在**可以不放**：把那一镜的 `asset` 键整个删掉，版式会画一个几何母题顶上去（见 `docs/01` 的插画说明），`assets` 也可以整份省略。所以"缺素材"不再是死路，跟用户说一声删掉即可。注意**不要填空字符串**（`""` 会报错）。

然后校验：

```bash
python3 scripts/pipe.py build content/<slug>.json     # Windows 上用 python
```

它一次列全所有错误，改到输出干净为止。这一步同时会做配音（首次要几分钟）并算出时间轴。

## 第 5 步 · 抽帧，给用户看，等他点头

```bash
python3 scripts/pipe.py preview content/<slug>.json --times auto
```

`--times auto` 会从 `timeline.json` 里挑 6 个点铺满全片（每镜解说进行到 65% 处，元素都已落位）。要单独看某一镜就传秒数：`--times 14.7,40.4`。

帧落在 `preview/p00_2.88s.jpg …`。**用 Read 工具把那 6 张图都看一遍**，重点查：

- 文字有没有溢出卡片、有没有压到安全区边界
- 插画有没有画出来（整块空白 = `asset` 名对不上）
- 相邻两镜是不是同一个颜色
- 大数字 / 长文案有没有挤爆卡片

把文件路径给用户，**同时报告你看到的问题**。有问题的先改再重抽，别让用户替你找错。

## 第 6 步 · 全量出片

用户确认抽帧之后：

```bash
python3 scripts/pipe.py all content/<slug>.json --name "<meta.title>"
```

跑 build → 配乐混音 → 逐帧渲染（3～4 分钟）→ 编码，产物在 `out/<name>.mp4`。

跑完报告：成片路径、时长、帧数、文件大小。想再核一遍音画同步可以跑 `python scripts/sync_check.py out/<name>.mp4`。

---

## 用户说这些，改这里

| 用户说 | 改什么 | 代价 |
|---|---|---|
| "太赶了 / 还没看清就过去了" | `meta.pace` 的 `tail`（首选，直接买到静止时间）与 `lead`；还不够就 `meta.rate` 降速 | 前两项只重渲染；`rate` 要重做全部配音 |
| "太拖了" | `meta.pace` 的 `lead`/`tail`/`lastTail` 往回收 | 只重渲染，不重配音 |
| "切镜太花 / 每屏闪一下" | `meta.pace` 的 `transition`/`flash`（都写 0 = 干净硬切） | 只重渲染，不重配音 |
| "换个配色" | `meta.style` | 只重渲染 |
| "这个颜色不喜欢" | 那一镜的 `accent`，或顶层 `theme` 微调 | 只重渲染 |
| "声音不好听 / 念太快" | `meta.voice` / `meta.rate` | **全部配音重做** |
| "文件太大 / 渲染太久" | `meta.fps` 降到 24 | 全流程，但省 20% |
| "这镜文案改成…" | 那一镜的 `narration` | 只重做那一镜配音 |
| "这镜版式不对" | 换 `tpl`。**必填字段跟着换**，从 schema 读新 tpl 那一节 | 只重渲染 |
| "字幕位置 / 加个新版式" | —— 这要改 `engine/engine.js`，超出本 skill | 直接说明 |

改完任何一项，重跑第 5 步的抽帧确认，再走第 6 步。

## 卡住了看这里

| 现象 | 原因 |
|---|---|
| `build_content.py` 报"没有这个插画" | `asset` 名不在 `assets` 里，或文件不存在。想不放插画就**删掉整个 `asset` 键**，空字符串 `""` 也会报这个错 |
| 报"未知字段 xxx" | 该 tpl 没有这个字段，或拼错了。schema 里 `scenes.tpl.<名>.fields` 是准的 |
| 报"theme 里多出 xxx" | token 名不在 `colors.themeKeys` 里 |
| 报 schema 和 engine 对不上 | 有人加了颜色 token 没同步 `content/schema.json`，这是**真 bug**，报告用户，别自己改 engine |
| 抽帧是空白页 | 页面加载失败。看 `render_frames.js` 有没有打 `PAGE ERROR` |
| 找不到 `python3` | Windows 上就是 `python` |

细节问题查 `docs/`：`02-版式与风格.md` 讲版式和配色，`03-出片流程.md` 讲管线每一步，`05-校验方法.md` 讲校验。
