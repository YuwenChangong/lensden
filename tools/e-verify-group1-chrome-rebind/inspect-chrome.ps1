$ErrorActionPreference='Stop'
$root=Join-Path $PSScriptRoot 'artifacts'
$out=Join-Path $root 'CHROME_IDENTITY_LOCAL_SAFE.json'
if(Test-Path -LiteralPath $out){throw 'EXISTING_IDENTITY_RECEIPT'}
$p='C:\Program Files\Google\Chrome\Application\chrome.exe'
$s=Get-AuthenticodeSignature -LiteralPath $p
$f=Get-Item -LiteralPath $p
$hash=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()
$registered=(Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\WOW6432Node\Google\Update\Clients\{8A69D345-D564-463C-AFF1-A69D9E530F96}').pv
$valid=$s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match '(^|, )CN=Google LLC(,|$)' -and $registered -eq $f.VersionInfo.ProductVersion
if(-not $valid){throw 'CHROME_IDENTITY_BLOCKED'}
$log='C:\Program Files (x86)\Google\GoogleUpdater\updater.log'
$mentions=0
if(Test-Path -LiteralPath $log){foreach($line in [IO.File]::ReadLines($log)){if($line.Contains($registered)){$mentions++}}}
$old='d3784ffbf1f6109348416064b3e4cd739b06fa61d89a81b262c780df9f32270c'
$oldFiles=@(Get-ChildItem -LiteralPath $f.DirectoryName -File -Filter '*chrome*.exe' | Where-Object{(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -eq $old})
$r=[ordered]@{status='PASS';path=$p;version=$f.VersionInfo.ProductVersion;sha256=$hash;signatureStatus=$s.Status.ToString();publisher='Google LLC';signerSubject=$s.SignerCertificate.Subject;signerIssuer=$s.SignerCertificate.Issuer;timestampSubject=$s.TimeStamperCertificate.Subject;registeredVersion=$registered;updaterLogPresent=(Test-Path -LiteralPath $log);currentVersionUpdaterMentions=$mentions;previousSha256=$old;previousVersion='UNKNOWN_NOT_RECORDED';oldBinaryFound=($oldFiles.Count -gt 0);installationPathUnchanged=$true;preciseUpdateEvent='NOT_PROVEN_FROM_RETAINED_EVIDENCE';rootCause='TRUSTED_INSTALLED_BINARY_BYTES_CHANGED';providerRequests=0;productionRequests=0;productionWrites=0}
if(-not(Test-Path -LiteralPath $root)){New-Item -ItemType Directory -Path $root | Out-Null}
$json=$r | ConvertTo-Json -Depth 5
$bytes=[Text.UTF8Encoding]::new($false).GetBytes($json+"`n")
$stream=[IO.File]::Open($out,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
[pscustomobject]@{status='PASS';version=$r.version;sha256=$hash;signature='Valid_Google_LLC';oldBinaryFound=$r.oldBinaryFound;productionRequests=0} | ConvertTo-Json -Compress
