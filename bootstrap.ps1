<#
  bootstrap.ps1 —— 新机器/新环境一句话开工：装依赖 -> 出片 -> 校验

  用法：
    .\bootstrap.ps1                                    # 全流程
    .\bootstrap.ps1 -Name "给孩子买保险-科普短片"        # 指定成片名
    .\bootstrap.ps1 -PreviewOnly                       # 只装依赖 + 抽 6 帧预览（最快验环境）
    .\bootstrap.ps1 -SkipInstall                       # 依赖已装好，直接出片
    .\bootstrap.ps1 -SkipVerify                        # 不校验
    .\bootstrap.ps1 -SkipRender                        # 复用 out\frames，只重编码
    .\bootstrap.ps1 -DryRun                            # 只打印将要执行的命令，不动手
    .\bootstrap.ps1 -PipIndexUrl https://pypi.tuna.tsinghua.edu.cn/simple
    .\bootstrap.ps1 -Python "C:\...\python.exe" -Node "C:\...\node.exe"

  三个阶段：
    1/3 install_deps.ps1   依赖装进项目内 deps\（之后永久免配环境变量）
    2/3 run.ps1            内容 -> 配音 -> 配乐 -> 逐帧渲染 -> 编码，产出 out\<Name>.mp4
    3/3 校验               sync_check.py 查音画同步；verify.py + ocr_all.js 查关键帧文字

  改文案就改 content\*.json 的 narration，然后 .\bootstrap.ps1 -SkipInstall（配音只重做改动的镜次）。
#>
param(
  [string]$Content = "content\child-insurance.json",
  [string]$Name    = "video",
  [string]$Python  = "python",
  [string]$Node    = "node",
  [string]$PipIndexUrl,
  [string]$NpmRegistry,
  [switch]$SkipInstall,
  [switch]$SkipBrowser,
  [switch]$SkipRender,
  [switch]$SkipVerify,
  [switch]$PreviewOnly,
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$env:PYTHONIOENCODING = "utf-8"

$root = $PSScriptRoot
Set-Location $root
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$mp4 = Join-Path $root ("out\" + $Name + ".mp4")

function Step([string]$t) { Write-Host ""; Write-Host ("===== " + $t) -ForegroundColor Cyan }
function Say([string]$t)  { Write-Host ("    " + $t) -ForegroundColor DarkGray }

# 注意：这里必须用哈希表 splat —— 数组 splat 不会把 "-Name" 当成参数名
$installArgs = @{ Python = $Python; Node = $Node }
if ($PipIndexUrl) { $installArgs.PipIndexUrl = $PipIndexUrl }
if ($NpmRegistry) { $installArgs.NpmRegistry = $NpmRegistry }
if ($SkipBrowser) { $installArgs.SkipBrowser = $true }
if ($DryRun)      { $installArgs.DryRun = $true }

$runArgs = @{ Content = $Content; Name = $Name; Python = $Python; Node = $Node }
if ($SkipRender)  { $runArgs.SkipRender = $true }
if ($PreviewOnly) { $runArgs.PreviewOnly = $true }

# ---------- 1/3 依赖 ----------
if ($SkipInstall) {
  Write-Host "跳过依赖安装（-SkipInstall）" -ForegroundColor DarkGray
} else {
  Step "1/3 依赖 -> deps\"
  & (Join-Path $root "install_deps.ps1") @installArgs
}

if ($DryRun) {
  Step "2/3 出片（-DryRun，不执行）"
  Say ("$Python scripts\build_content.py $Content")
  Say ("$Node scripts\render_frames.js png")
  Say ("$Python scripts\mix_audio.py   # 缺 bgm.wav 时先跑 make_bgm.py")
  Say ("$Python scripts\encode.py")
  if (-not $SkipVerify -and -not $PreviewOnly) {
    Step "3/3 校验（-DryRun，不执行）"
    Say ("$Python scripts\sync_check.py out\$Name.mp4")
    Say ("$Python scripts\verify.py ; $Node scripts\ocr_all.js verify_frames")
  }
  Write-Host ""
  Write-Host "（-DryRun：以上命令都没有真的执行）" -ForegroundColor Yellow
  return
}

# ---------- 2/3 出片 ----------
Step "2/3 出片 -> out\$Name.mp4"
. (Join-Path $root "setenv.ps1") -Python $Python -Node $Node
if (-not $env:PYTHONPATH -or -not $env:NODE_PATH) {
  throw "依赖还没配好（见上面的红字）。可以手动跑一次：  .\install_deps.ps1"
}
& (Join-Path $root "run.ps1") @runArgs

if ($PreviewOnly) {
  Write-Host ""
  Write-Host ("预览 OK -> .\preview\   总耗时 " + [int]$sw.Elapsed.TotalSeconds + " 秒") -ForegroundColor Green
  Write-Host ("环境没问题，接着跑全量：  .\bootstrap.ps1 -SkipInstall -Name `"$Name`"") -ForegroundColor DarkGray
  return
}

# ---------- 3/3 校验 ----------
$syncOk = $true
if ($SkipVerify) {
  Write-Host "跳过校验（-SkipVerify）" -ForegroundColor DarkGray
} else {
  Step "3/3 校验"
  if (-not (Test-Path $mp4)) { throw "没找到成片 $mp4，先看上面的报错。" }

  Write-Host "  -- 音画同步（每镜起音点 RMS 比 > 4 为过）" -ForegroundColor DarkGray
  $sync = & $Python (Join-Path $root "scripts\sync_check.py") $mp4 2>&1 | Out-String
  Write-Host $sync
  $syncOk = ("$sync" -match "RESULT: PASS")

  Write-Host "  -- 抽关键帧到 verify_frames\" -ForegroundColor DarkGray
  $vf = & $Python (Join-Path $root "scripts\verify.py") 2>&1 | Out-String
  Write-Host $vf

  Write-Host "  -- 关键帧 OCR（首次会下 chi_sim 语言包，慢一点）" -ForegroundColor DarkGray
  $ocr = & $Node (Join-Path $root "scripts\ocr_all.js") verify_frames 2>&1 | Out-String
  Write-Host $ocr
  if ("$ocr" -match "Cannot find module|Error:") {
    Write-Host "  OCR 没跑成（多半是没网下语言包）。不影响成片，人工看 verify_frames\ 里的图即可。" -ForegroundColor Yellow
  }
}

# ---------- 收尾 ----------
$sizeMB = if (Test-Path $mp4) { (Get-Item $mp4).Length / 1MB } else { 0 }
Write-Host ""
Write-Host "===== 完成 =====" -ForegroundColor Green
Write-Host ("成片   : " + $mp4)
Write-Host ("大小   : {0:N2} MB" -f $sizeMB)
Write-Host ("耗时   : {0} 秒" -f [int]$sw.Elapsed.TotalSeconds)
Write-Host ("关键帧 : " + (Join-Path $root "verify_frames"))
Write-Host ("改内容 : 编辑 " + $Content + " 的 narration，再跑 .\bootstrap.ps1 -SkipInstall")

if (-not $syncOk) {
  throw "音画同步校验没通过（见上面的表）。成片在 $mp4，先别发，检查配音时长 / 时间轴。"
}
