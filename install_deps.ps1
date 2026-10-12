<#
  install_deps.ps1 —— 把依赖装进项目内的 deps\，之后不用再配任何环境变量

  用法：
    .\install_deps.ps1                     # Python + Node 依赖 + Edge 驱动
    .\install_deps.ps1 -DryRun             # 只打印要执行的命令，不真装
    .\install_deps.ps1 -SkipNode           # 只装 Python 侧
    .\install_deps.ps1 -SkipBrowser        # 跳过 playwright install msedge
    .\install_deps.ps1 -PipIndexUrl https://pypi.tuna.tsinghua.edu.cn/simple
    .\install_deps.ps1 -NpmRegistry https://registry.npmmirror.com
    .\install_deps.ps1 -Python "C:\Users\me\miniconda3\python.exe" -Node "C:\Program Files\nodejs\node.exe"

  装完的样子：
    deps\pylibs\         edge-tts / numpy / imageio-ffmpeg
    deps\node_modules\   playwright / sharp / tesseract.js
  setenv.ps1 和 run.ps1 都会优先认这个目录，之后 `.\run.ps1` 一句就能出片。
  deps\ 已在 .gitignore 里，不会进版本库。
#>
param(
  [string]$Python = "python",
  [string]$Node   = "node",
  [string]$PipIndexUrl,
  [string]$NpmRegistry,
  [switch]$SkipPython,
  [switch]$SkipNode,
  [switch]$SkipBrowser,
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$env:PYTHONIOENCODING = "utf-8"

$root  = $PSScriptRoot
$deps  = Join-Path $root "deps"
$pylib = Join-Path $deps "pylibs"

function Write-Head([string]$t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Write-Cmd([string] $e, [string[]]$a) { Write-Host ("    " + $e + " " + ($a -join " ")) -ForegroundColor DarkGray }
function Resolve-Exe([string]$exe, [string]$hint) {
  if (Test-Path $exe) { return (Get-Item $exe).FullName }
  $c = Get-Command $exe -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  if (-not $hint) { throw "找不到 $exe。装好它并加进 PATH，或用参数传完整路径。" }
  throw "找不到 $exe`n传个完整路径，例如： .\install_deps.ps1 $hint"
}

# ---------- Python 侧 ----------
if ($SkipPython) {
  Write-Host "跳过 Python 依赖（-SkipPython）" -ForegroundColor DarkGray
} else {
  Write-Head "Python 依赖 -> deps\pylibs"
  $py = Resolve-Exe $Python '-Python "C:\path\python.exe"'
  Write-Host "    python: $py" -ForegroundColor DarkGray
  $pipArgs = @("-m", "pip", "install", "--target", $pylib, "--upgrade",
               "edge-tts==7.2.8", "numpy", "imageio-ffmpeg")
  if ($PipIndexUrl) { $pipArgs += @("-i", $PipIndexUrl) }
  if ($DryRun) {
    Write-Cmd $py $pipArgs
  } else {
    New-Item -ItemType Directory -Path $pylib -Force | Out-Null
    Write-Cmd $py $pipArgs
    & $py @pipArgs
    if ($LASTEXITCODE -ne 0) {
      throw ("pip 安装失败。国内网络换镜像重试：`n" +
             "  .\install_deps.ps1 -PipIndexUrl https://pypi.tuna.tsinghua.edu.cn/simple")
    }
    $env:PYTHONPATH = $pylib
    $probe = & $py -c "import edge_tts, numpy, imageio_ffmpeg; assert callable(imageio_ffmpeg.get_ffmpeg_exe) and hasattr(edge_tts, 'Communicate'); print('__DEPS_OK__')" 2>$null
    if ("$probe" -notmatch '__DEPS_OK__') { throw "装进去了但 import 不通，检查 $pylib" }
    Write-Host "    python deps OK" -ForegroundColor DarkGray
  }
}

# ---------- Node 侧 ----------
if ($SkipNode) {
  Write-Host "跳过 Node 依赖（-SkipNode）" -ForegroundColor DarkGray
} else {
  Write-Head "Node 依赖 -> deps\node_modules"
  $nd = Resolve-Exe $Node '-Node "C:\path\node.exe"'
  Write-Host "    node: $nd" -ForegroundColor DarkGray
  $npm = Resolve-Exe "npm.cmd" ""
  $npmArgs = @("install", "--prefix", $deps, "--no-fund", "--no-audit",
               "playwright@1.62.1", "sharp", "tesseract.js")
  if ($NpmRegistry) { $npmArgs += @("--registry", $NpmRegistry) }
  $nodeMods = Join-Path $deps "node_modules"
  $pwCli = Join-Path $nodeMods "playwright\cli.js"
  if ($DryRun) {
    Write-Host "    (env) PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1" -ForegroundColor DarkGray
    Write-Cmd $npm $npmArgs
    if (-not $SkipBrowser) { Write-Cmd $nd @($pwCli, "install", "msedge") }
  } else {
    New-Item -ItemType Directory -Path $deps -Force | Out-Null
    # 只下 msedge 一套，省掉 playwright 默认那几套浏览器的下载
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
    Write-Cmd $npm $npmArgs
    & $npm @npmArgs
    if ($LASTEXITCODE -ne 0) {
      throw ("npm 安装失败。国内网络换镜像重试：`n" +
             "  .\install_deps.ps1 -NpmRegistry https://registry.npmmirror.com")
    }
    $env:NODE_PATH = $nodeMods
    $probe = & $nd -e "require('playwright').chromium; require('sharp'); require('tesseract.js'); console.log('__DEPS_OK__')" 2>$null
    if ("$probe" -notmatch '__DEPS_OK__') { throw "装了 node_modules 但 require 不通，检查 $nodeMods" }
    Write-Host "    node deps OK" -ForegroundColor DarkGray
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = $null
    if (-not $SkipBrowser) {
      Write-Head "Edge 驱动（渲染用）"
      if (Test-Path $pwCli) {
        Write-Cmd $nd @($pwCli, "install", "msedge")
        & $nd $pwCli install msedge
        if ($LASTEXITCODE -ne 0) {
          Write-Host "    msedge 没装成。机器上本来就有 Edge 的话通常也能跑，先继续。" -ForegroundColor Yellow
        }
      } else {
        Write-Host "    没找到 $pwCli，跳过。" -ForegroundColor Yellow
      }
    }
  }
}

# ---------- 复验 ----------
if ($DryRun) {
  Write-Host ""
  Write-Host "（-DryRun：以上命令都没有真的执行）" -ForegroundColor Yellow
  return
}
Write-Head "复验"
. (Join-Path $root "setenv.ps1") -Python $Python -Node $Node
