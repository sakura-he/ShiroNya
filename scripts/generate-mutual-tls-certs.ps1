param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDir,
    [Parameter(Mandatory = $true)]
    [string]$CaCommonName,
    [Parameter(Mandatory = $true)]
    [string]$ServerCommonName,
    [Parameter(Mandatory = $true)]
    [string]$ClientCommonName,
    [string[]]$ServerDnsNames = @(),
    [string[]]$ServerIpAddresses = @(),
    [int]$CaValidYears = 10,
    [int]$LeafValidYears = 5
)

$ErrorActionPreference = "Stop"

# Encode DER bytes as PEM text so the files can be mounted directly into containers.
function Write-PemFile {
    param(
        [string]$Path,
        [string]$Label,
        [byte[]]$Bytes
    )

    $base64 = [Convert]::ToBase64String($Bytes)
    $builder = New-Object System.Text.StringBuilder
    [void]$builder.AppendLine("-----BEGIN $Label-----")

    for ($index = 0; $index -lt $base64.Length; $index += 64) {
        $length = [Math]::Min(64, $base64.Length - $index)
        [void]$builder.AppendLine($base64.Substring($index, $length))
    }

    [void]$builder.AppendLine("-----END $Label-----")
    [System.IO.File]::WriteAllText($Path, $builder.ToString(), [System.Text.Encoding]::ASCII)
}

# Export PKCS8 private keys for common Node / Nginx / Go TLS consumers.
function Get-PrivateKeyBytes {
    param(
        [System.Security.Cryptography.RSA]$Key
    )

    if ($Key.PSObject.Methods.Name -contains "ExportPkcs8PrivateKey") {
        return $Key.ExportPkcs8PrivateKey()
    }

    if ($Key -is [System.Security.Cryptography.RSACng]) {
        return $Key.Key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
    }

    throw "The current runtime cannot export PKCS8 private keys."
}

# Generate an independent serial number for each certificate to avoid collisions.
function New-SerialBytes {
    $serial = New-Object byte[] 16
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($serial)
    $rng.Dispose()
    return $serial
}

# Generate a self-signed CA used to issue the server and client certificates.
function New-CertificateAuthority {
    param(
        [string]$CommonName,
        [int]$ValidYears
    )

    $caKey = [System.Security.Cryptography.RSA]::Create(4096)
    $caRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
        "CN=$CommonName",
        $caKey,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256,
        [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
    )

    $caRequest.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true, $false, 0, $true)
    )
    $caRequest.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($caRequest.PublicKey, $false)
    )
    $caRequest.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
            [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign -bor
            [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::CrlSign,
            $true
        )
    )

    $certificate = $caRequest.CreateSelfSigned(
        [DateTimeOffset]::UtcNow.AddDays(-1),
        [DateTimeOffset]::UtcNow.AddYears($ValidYears)
    )

    return @{
        Certificate = $certificate
        Key = $caKey
    }
}

# Generate CA-signed leaf certificates and populate EKU / SAN based on usage.
function New-SignedLeafCertificate {
    param(
        [string]$CommonName,
        [System.Security.Cryptography.X509Certificates.X509Certificate2]$AuthorityCertificate,
        [string[]]$EnhancedKeyUsageOids,
        [string[]]$DnsNames = @(),
        [string[]]$IpAddresses = @(),
        [int]$ValidYears = 5
    )

    $leafKey = [System.Security.Cryptography.RSA]::Create(4096)
    $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
        "CN=$CommonName",
        $leafKey,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256,
        [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
    )

    $request.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true)
    )
    $request.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
            [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor
            [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,
            $true
        )
    )
    $request.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($request.PublicKey, $false)
    )

    $enhancedUsages = New-Object System.Security.Cryptography.OidCollection
    foreach ($oid in $EnhancedKeyUsageOids) {
        [void]$enhancedUsages.Add([System.Security.Cryptography.Oid]::new($oid))
    }
    $request.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($enhancedUsages, $false)
    )

    if ($DnsNames.Count -gt 0 -or $IpAddresses.Count -gt 0) {
        $sanBuilder = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()

        foreach ($dnsName in $DnsNames) {
            $sanBuilder.AddDnsName($dnsName)
        }

        foreach ($ipAddress in $IpAddresses) {
            $sanBuilder.AddIpAddress([System.Net.IPAddress]::Parse($ipAddress))
        }

        $request.CertificateExtensions.Add($sanBuilder.Build())
    }

    $certificate = $request.Create(
        $AuthorityCertificate,
        [DateTimeOffset]::UtcNow.AddDays(-1),
        [DateTimeOffset]::UtcNow.AddYears($ValidYears),
        (New-SerialBytes)
    )

    return @{
        Certificate = $certificate
        Key = $leafKey
    }
}

if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $absoluteOutputDir = [System.IO.Path]::GetFullPath($OutputDir)
} else {
    $absoluteOutputDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDir))
}
[System.IO.Directory]::CreateDirectory($absoluteOutputDir) | Out-Null

$authority = New-CertificateAuthority -CommonName $CaCommonName -ValidYears $CaValidYears
$server = New-SignedLeafCertificate `
    -CommonName $ServerCommonName `
    -AuthorityCertificate $authority.Certificate `
    -EnhancedKeyUsageOids @("1.3.6.1.5.5.7.3.1") `
    -DnsNames $ServerDnsNames `
    -IpAddresses $ServerIpAddresses `
    -ValidYears $LeafValidYears
$client = New-SignedLeafCertificate `
    -CommonName $ClientCommonName `
    -AuthorityCertificate $authority.Certificate `
    -EnhancedKeyUsageOids @("1.3.6.1.5.5.7.3.2") `
    -ValidYears $LeafValidYears

Write-PemFile -Path (Join-Path $absoluteOutputDir "ca.crt") -Label "CERTIFICATE" -Bytes $authority.Certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
Write-PemFile -Path (Join-Path $absoluteOutputDir "ca.key") -Label "PRIVATE KEY" -Bytes (Get-PrivateKeyBytes -Key $authority.Key)
Write-PemFile -Path (Join-Path $absoluteOutputDir "server.crt") -Label "CERTIFICATE" -Bytes $server.Certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
Write-PemFile -Path (Join-Path $absoluteOutputDir "server.key") -Label "PRIVATE KEY" -Bytes (Get-PrivateKeyBytes -Key $server.Key)
Write-PemFile -Path (Join-Path $absoluteOutputDir "client.crt") -Label "CERTIFICATE" -Bytes $client.Certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
Write-PemFile -Path (Join-Path $absoluteOutputDir "client.key") -Label "PRIVATE KEY" -Bytes (Get-PrivateKeyBytes -Key $client.Key)

Write-Host "Generated mTLS certificate directory:"
Write-Host "  $absoluteOutputDir"
