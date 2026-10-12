<#
  一键出片
  用法：
    .\run.ps1                                  # 用默认内容出片
    .\run.ps1 -Name 给孩子买保险-科普短片
    .\run.ps1 -Content content\xxx.json -Name xxx
    .\run.ps1 -PreviewOnly                     # 只抽 6 帧预览
    .\run.ps1 -SkipRender                      # 复用现有 out\frames，只重编码
    .\run.ps1 -Python "C:\path\python.exe" -Node "C:\path\node.exe"
#>
param(
  [string]$Content = "content\child-insurance.json",
  [string]$Name    = "video",
  [string]$Python  = "python",
  [string]$Node    = "node",
  [switch]$SkipRender,
  [switch]$PreviewOnly
)
$ErrorActionPreference = "Stop"

# 让子进程（python / node）用 UTF-8 输出，避免中文乱码
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$env:PYTHONIOENCODING = "utf-8"
$root = $PSScriptRoot
Set-Location $root

# ---------- 依赖路径 ----------
# 若依赖路径还未配好，且同目录存在 setenv.ps1，则自动加载一次（等价于手动 `. .\setenv.ps1`）
if ((-not $env:PYTHONPATH -or -not $env:NODE_PATH) -and (Test-Path (Join-Path $root "setenv.ps1"))) {
  . (Join-Path $root "setenv.ps1") -Python $Python -Node $Node
}
# 优先用环境变量；否则用项目内 deps\ 目录；都没有就报错并给出提示
if (-not $env:PYTHONPATH) {
  $local = Join-Path $root "deps\pylibs"
  if (Test-Path $local) { $env:PYTHONPATH = $local }
}
if (-not $env:NODE_PATH) {
  $local = Join-Path $root "deps\node_modules"
  if (Test-Path $local) { $env:NODE_PATH = $local }
}
$env:RENDER_HTML = "engine/render.html"
$env:OUT_DIR     = "out"
$env:OUT_NAME    = $Name

Write-Host "依赖检查..." -ForegroundColor DarkGray
$probe = & $Python -c "import edge_tts, numpy, imageio_ffmpeg; assert callable(imageio_ffmpeg.get_ffmpeg_exe) and hasattr(edge_tts, 'Communicate'); print('__DEPS_OK__')" 2>$null
if ("$probe" -notmatch '__DEPS_OK__') {
  throw 'Python 依赖缺失。推荐先跑  .\install_deps.ps1  装进项目（一次性）；或用  . .\setenv.ps1  复用已有依赖。'
}
Push-Location (Join-Path $root "engine")
$probe = & $Node -e "require('playwright').chromium; require('sharp'); console.log('__DEPS_OK__')" 2>$null
$nodeOk = ("$probe" -match '__DEPS_OK__')
Pop-Location
if (-not $nodeOk) {
  throw 'Node 依赖缺失。推荐先跑  .\install_deps.ps1  装进项目（一次性）；或用  . .\setenv.ps1  复用已有依赖。'
}

Write-Host "==> 1/4 内容 -> 时间轴 + 配音（文案没变的镜次会走缓存）" -ForegroundColor Cyan
& $Python (Join-Path $root "scripts\build_content.py") $Content
if ($LASTEXITCODE -ne 0) { throw "build_content.py 失败" }

if ($PreviewOnly) {
  Write-Host "==> 预览：抽 6 个时间点" -ForegroundColor Cyan
  & $Node (Join-Path $root "scripts\render_frames.js") preview "[1.5,10.3,20.0,28.0,45.5,58.5]" preview
  Write-Host "预览帧在 .\preview\" -ForegroundColor Green
  exit 0
}

Write-Host "==> 2/4 音频：背景音乐 + 混音" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $root "bgm.wav"))) {
  & $Python (Join-Path $root "scripts\make_bgm.py")
  if ($LASTEXITCODE -ne 0) { throw "make_bgm.py 失败" }
} else {
  Write-Host "    复用 bgm.wav" -ForegroundColor DarkGray
}
& $Python (Join-Path $root "scripts\mix_audio.py")
if ($LASTEXITCODE -ne 0) { throw "mix_audio.py 失败" }

if (-not $SkipRender) {
  Write-Host "==> 3/4 逐帧渲染（约 3.5 分钟）" -ForegroundColor Cyan
  & $Node (Join-Path $root "scripts\render_frames.js") png
  if ($LASTEXITCODE -ne 0) { throw "render_frames.js 失败" }
} else {
  Write-Host "==> 3/4 跳过渲染（复用 out\frames）" -ForegroundColor Yellow
}

Write-Host "==> 4/4 编码" -ForegroundColor Cyan
& $Python (Join-Path $root "scripts\encode.py")
if ($LASTEXITCODE -ne 0) { throw "encode.py 失败" }

Write-Host "`n完成 -> out\$Name.mp4" -ForegroundColor Green
Write-Host "建议接着校验：" -ForegroundColor DarkGray
Write-Host "  $Python scripts\sync_check.py out\$Name.mp4" -ForegroundColor DarkGray
Write-Host "  $Python scripts\verify.py ; $Node scripts\ocr_all.js verify_frames" -ForegroundColor DarkGray
