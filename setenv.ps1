<#
  setenv.ps1 —— 一键配好本会话所需的依赖路径

  用法（注意前面有个点！点一下才会作用于当前终端）：
      . .\setenv.ps1
      . .\setenv.ps1 -Python "C:\Users\me\miniconda3\python.exe"

  它会按顺序探测可用的依赖目录，用"真的 import 一次"来验证，而不是猜。
  探测顺序：
    Python:  -PythonPath 参数  ->  <项目>\deps\pylibs  ->  已设的 PYTHONPATH  ->  常见缓存目录
    Node  :  -NodePath   参数  ->  <项目>\deps\node_modules -> 已设的 NODE_PATH -> 常见缓存目录
#>
param(
  [string]$Python = "python",
  [string]$PythonPath,
  [string]$NodePath,
  [string]$Node = "node"
)

# 让子进程（python / node）用 UTF-8 输出，避免中文乱码
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$env:PYTHONIOENCODING = "utf-8"

$dotSourced = ($MyInvocation.InvocationName -eq '.')
$root = $PSScriptRoot
$candidates = [ordered]@{}

# ---------- Python ----------
$pyList = @()
if ($PythonPath) { $pyList += $PythonPath }
$pyList += (Join-Path $root "deps\pylibs")
if ($env:PYTHONPATH) { $pyList += $env:PYTHONPATH }
$pyList += "C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work\pylibs"
$pyList = $pyList | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$pyPick = $null
$pySaved = $env:PYTHONPATH
foreach ($cand in $pyList) {
  $env:PYTHONPATH = $cand
  $probe = & $Python -c "import edge_tts, numpy, imageio_ffmpeg; assert callable(imageio_ffmpeg.get_ffmpeg_exe) and hasattr(edge_tts, 'Communicate'); print('__DEPS_OK__')" 2>$null
  if ("$probe" -match '__DEPS_OK__') { $pyPick = $cand; break }
}
if ($pyPick) { $env:PYTHONPATH = $pyPick } else { $env:PYTHONPATH = $pySaved }
$pyOk = [bool]$pyPick

# ---------- Node ----------
$ndList = @()
if ($NodePath) { $ndList += $NodePath }
$ndList += (Join-Path $root "deps\node_modules")
if ($env:NODE_PATH) { $ndList += $env:NODE_PATH }
$ndList += "C:\Users\qingy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
$ndList = $ndList | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$ndPick = $null
$ndSaved = $env:NODE_PATH
foreach ($cand in $ndList) {
  $env:NODE_PATH = $cand
  $probe = & $Node -e "require('playwright').chromium; require('sharp'); console.log('__DEPS_OK__')" 2>$null
  if ("$probe" -match '__DEPS_OK__') { $ndPick = $cand; break }
}
if ($ndPick) { $env:NODE_PATH = $ndPick } else { $env:NODE_PATH = $ndSaved }
$ndOk = [bool]$ndPick

# ---------- 渲染入口 ----------
$env:RENDER_HTML = "engine/render.html"

# ---------- 汇报 ----------
Write-Host ""
Write-Host "依赖检查" -ForegroundColor Cyan
if ($pyOk) {
  Write-Host ("  Python  OK   edge_tts / imageio_ffmpeg / numpy   " + $env:PYTHONPATH) -ForegroundColor Green
} else {
  Write-Host "  Python  缺   edge_tts 或 imageio_ffmpeg 没找到" -ForegroundColor Red
  Write-Host "              一句装好： .\install_deps.ps1" -ForegroundColor DarkGray
  Write-Host "              或手动：  python -m pip install --target `"$root\deps\pylibs`" `"edge-tts==7.2.8`" imageio-ffmpeg" -ForegroundColor DarkGray
}
if ($ndOk) {
  Write-Host ("  Node    OK   playwright / sharp              " + $env:NODE_PATH) -ForegroundColor Green
} else {
  Write-Host "  Node    缺   playwright 或 sharp 没找到" -ForegroundColor Red
  Write-Host "              一句装好： .\install_deps.ps1" -ForegroundColor DarkGray
  Write-Host "              或手动：  npm install --prefix deps playwright sharp tesseract.js" -ForegroundColor DarkGray
}
Write-Host ("  RENDER_HTML = " + $env:RENDER_HTML) -ForegroundColor DarkGray

if ($pyOk -and $ndOk) {
  Write-Host ""
  Write-Host "可以开工了：" -ForegroundColor Green
  Write-Host "  .\run.ps1 -Name 我的视频" -ForegroundColor White
} else {
  Write-Host ""
  Write-Host "先补齐上面标红的依赖，再运行 .\run.ps1" -ForegroundColor Yellow
}

if (-not $dotSourced) {
  Write-Host ""
  Write-Host "提示：你是用 .\setenv.ps1 运行的，变量只在这个脚本里有效。" -ForegroundColor Yellow
  Write-Host "      请用点源方式运行：  . .\setenv.ps1" -ForegroundColor Yellow
}
