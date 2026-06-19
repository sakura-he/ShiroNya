param(
    [string]$OutputDir = "docker/config/admin-api-cerbos/tls",
    [string[]]$ServerDnsNames = @("localhost", "admin-cerbos-server"),
    [string[]]$ServerIpAddresses = @("127.0.0.1")
)

$ErrorActionPreference = "Stop"

# Generate admin Cerbos mTLS assets shared by admin-api and admin-api-cerbos-grpc-proxy.
# Resolve the helper script from this file path so the current working directory does not matter.
$scriptRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptRoot) -and -not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
    $scriptRoot = Split-Path -Parent $PSCommandPath
}
if ([string]::IsNullOrWhiteSpace($scriptRoot) -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Definition)) {
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
}
if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
    throw "Unable to resolve the generate-admin-cerbos-tls-certs.ps1 script directory."
}

$scriptPath = Join-Path $scriptRoot "generate-mutual-tls-certs.ps1"
$params = @{
    OutputDir = $OutputDir
    CaCommonName = "Admin Cerbos TLS CA"
    ServerCommonName = "admin-cerbos-server"
    ClientCommonName = "admin-cerbos-client"
    ServerDnsNames = $ServerDnsNames
    ServerIpAddresses = $ServerIpAddresses
}

& $scriptPath @params
