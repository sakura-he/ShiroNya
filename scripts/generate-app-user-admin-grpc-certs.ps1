param(
    [string]$OutputDir = "docker/config/app-user-admin-grpc/tls",
    [string[]]$ServerDnsNames = @("localhost", "app-api", "app-user-admin-grpc"),
    [string[]]$ServerIpAddresses = @("127.0.0.1")
)

$ErrorActionPreference = "Stop"

# Generate AppUserAdmin gRPC mTLS assets shared by app-api and admin-api.
# Resolve the helper script from this file path so the current working directory does not matter.
$scriptRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptRoot) -and -not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
    $scriptRoot = Split-Path -Parent $PSCommandPath
}
if ([string]::IsNullOrWhiteSpace($scriptRoot) -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Definition)) {
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
}
if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
    throw "Unable to resolve the generate-app-user-admin-grpc-certs.ps1 script directory."
}

$scriptPath = Join-Path $scriptRoot "generate-mutual-tls-certs.ps1"
$params = @{
    OutputDir = $OutputDir
    CaCommonName = "AppUserAdmin gRPC CA"
    ServerCommonName = "localhost"
    ClientCommonName = "admin-api-app-user-client"
    ServerDnsNames = $ServerDnsNames
    ServerIpAddresses = $ServerIpAddresses
}

& $scriptPath @params
