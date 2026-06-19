param(
    [string]$PromtailBin = $env:PROMTAIL_BIN,
    [int]$HttpPort = 9082,
    [string]$RemoteLokiUrl = $env:REMOTE_LOKI_URL,
    [string]$LokiHost = $env:J1900_LOKI_HOST,
    [string]$LokiServerName = $env:LOKI_TLS_SERVER_NAME,
    [string]$DropOlderThan = '90m',
    [string]$LogDate = (Get-Date).ToString('yyyy-MM-dd'),
    [switch]$UseSshTunnel,
    [string]$SshBin = 'ssh',
    [string]$SshHost = $env:J1900_SSH_HOST,
    [int]$LocalPort = 31011,
    [int]$RemotePort = 3101
)

$ErrorActionPreference = 'Stop'
$repoRootWindows = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

# ── 自动发现 Promtail ──
if ([string]::IsNullOrWhiteSpace($PromtailBin)) {
    $candidates = @(
        (Join-Path $repoRootWindows 'bin\promtail-windows-amd64.exe'),
        (Join-Path $repoRootWindows 'promtail-windows-amd64.exe')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            $PromtailBin = $candidate
            break
        }
    }

    if ([string]::IsNullOrWhiteSpace($PromtailBin)) {
        throw "缺少 Promtail 可执行文件路径。请传入 -PromtailBin，或先设置环境变量 PROMTAIL_BIN，或将 promtail-windows-amd64.exe 放在项目 bin 目录。"
    }
}

if (-not (Test-Path $PromtailBin)) {
    throw "Promtail 可执行文件不存在: $PromtailBin"
}

if ([string]::IsNullOrWhiteSpace($LokiServerName)) {
    $LokiServerName = 'loki'
}

if ([string]::IsNullOrWhiteSpace($LokiHost)) {
    $LokiHost = '100.68.195.89'
}

if ([string]::IsNullOrWhiteSpace($SshHost)) {
    $SshHost = 'shironeko@100.68.195.89'
}

if ([string]::IsNullOrWhiteSpace($RemoteLokiUrl)) {
    if ($UseSshTunnel) {
        $RemoteLokiUrl = "https://127.0.0.1:$LocalPort/loki/api/v1/push"
    } else {
        $RemoteLokiUrl = "https://$LokiHost`:3101/loki/api/v1/push"
    }
}

# ── 1. 可选 SSH 隧道 ──
if (-not $UseSshTunnel) {
    Write-Host "[SSH 隧道] 未启用，Promtail 将直连 J1900 Loki: $LokiHost`:3101。"
} else {
    $existingSsh = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'ssh.exe' -and $_.CommandLine -like "*$LocalPort`:127.0.0.1`:$RemotePort*"
    }

    if ($existingSsh) {
        Write-Host "[SSH 隧道] 已存在，跳过。"
    } else {
        $sshArgs = @(
            '-o', 'ExitOnForwardFailure=yes',
            '-o', 'ServerAliveInterval=30',
            '-o', 'ServerAliveCountMax=3',
            '-o', 'StrictHostKeyChecking=no',
            '-N',
            '-L', "$LocalPort`:127.0.0.1`:$RemotePort",
            $SshHost
        )

        $stdoutPath = Join-Path $env:TEMP "shiro-nya-loki-tunnel.stdout.log"
        $stderrPath = Join-Path $env:TEMP "shiro-nya-loki-tunnel.stderr.log"

        $sshProcess = Start-Process -FilePath $SshBin -ArgumentList $sshArgs -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        Start-Sleep -Seconds 3

        if (-not (Get-Process -Id $sshProcess.Id -ErrorAction SilentlyContinue)) {
            $stderr = if (Test-Path $stderrPath) { $raw = Get-Content -Path $stderrPath -Raw; if ($raw) { $raw.Trim() } else { '' } } else { '' }
            $stdout = if (Test-Path $stdoutPath) { $raw = Get-Content -Path $stdoutPath -Raw; if ($raw) { $raw.Trim() } else { '' } } else { '' }
            $detail = if (-not [string]::IsNullOrWhiteSpace($stderr)) { $stderr }
                      elseif (-not [string]::IsNullOrWhiteSpace($stdout)) { $stdout }
                      else { '未获取到 ssh 输出' }
            throw "[SSH 隧道] 启动失败: $detail"
        }

        Write-Host "[SSH 隧道] 已启动: 127.0.0.1:$LocalPort -> $SshHost`:$RemotePort"
    }
}

# ── 2. Promtail ──
$repoRoot = $repoRootWindows -replace '\\', '/'
$configPath = (Resolve-Path (Join-Path $repoRootWindows 'docker/config/promtail/promtail-local.windows.yaml')).Path -replace '\\', '/'
$localLogDir = Join-Path $repoRootWindows 'logs\loki'
$lokiTlsCaSource = Join-Path $repoRootWindows 'docker/config/loki/tls/ca.crt'
$lokiTlsClientCertSource = Join-Path $repoRootWindows 'docker/config/loki/tls/client.crt'
$lokiTlsClientKeySource = Join-Path $repoRootWindows 'docker/config/loki/tls/client.key'
$promtailExeName = [System.IO.Path]::GetFileName($PromtailBin)

if (-not (Test-Path $lokiTlsCaSource) -or -not (Test-Path $lokiTlsClientCertSource) -or -not (Test-Path $lokiTlsClientKeySource)) {
    throw "缺少 Loki TLS 证书。请先执行: pwsh ./scripts/generate-loki-tls-certs.ps1"
}

$lokiTlsCaPath = (Resolve-Path $lokiTlsCaSource).Path -replace '\\', '/'
$lokiTlsClientCertPath = (Resolve-Path $lokiTlsClientCertSource).Path -replace '\\', '/'
$lokiTlsClientKeyPath = (Resolve-Path $lokiTlsClientKeySource).Path -replace '\\', '/'

if (-not (Test-Path $localLogDir)) {
    New-Item -ItemType Directory -Force -Path $localLogDir | Out-Null
}

$existingPromtail = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq $promtailExeName -and $_.CommandLine -like "*--config.file=$configPath*"
}

if ($existingPromtail) {
    $existingPromtail | Select-Object ProcessId,Name,CommandLine
    Write-Host "[Promtail] 已存在，无需重复启动。HTTP 端口: $HttpPort"
    exit 0
}

$portListener = Get-NetTCPConnection -LocalPort $HttpPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

if ($portListener) {
    $portProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($portListener.OwningProcess)"
    throw "[Promtail] HTTP 端口 $HttpPort 已被占用，进程: $($portProcess.Name) (PID: $($portListener.OwningProcess))"
}

$env:SHIRO_NYA_ROOT = $repoRoot
$env:REMOTE_LOKI_URL = $RemoteLokiUrl
$env:PROMTAIL_HTTP_PORT = [string]$HttpPort
$env:LOKI_TLS_CA_PATH = $lokiTlsCaPath
$env:LOKI_TLS_CLIENT_CERT_PATH = $lokiTlsClientCertPath
$env:LOKI_TLS_CLIENT_KEY_PATH = $lokiTlsClientKeyPath
$env:LOKI_TLS_SERVER_NAME = $LokiServerName
$env:PROMTAIL_DROP_OLDER_THAN = $DropOlderThan
$env:PROMTAIL_LOG_DATE = $LogDate

Write-Host "[Promtail] SHIRO_NYA_ROOT=$repoRoot"
Write-Host "[Promtail] REMOTE_LOKI_URL=$RemoteLokiUrl"
Write-Host "[Promtail] J1900_LOKI_HOST=$LokiHost"
Write-Host "[Promtail] LOKI_TLS_SERVER_NAME=$LokiServerName"
Write-Host "[Promtail] PROMTAIL_HTTP_PORT=$HttpPort"
Write-Host "[Promtail] PROMTAIL_DROP_OLDER_THAN=$DropOlderThan"
Write-Host "[Promtail] PROMTAIL_LOG_DATE=$LogDate"
Write-Host "[Promtail] CONFIG=$configPath"

& $PromtailBin "--config.file=$configPath" '--config.expand-env=true'
