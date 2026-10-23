param([string]$Directory, [string]$Namespace, [switch]$SelfTest, [switch]$SetupProbe)
$ErrorActionPreference = 'Stop'
# This process needs only Windows PowerShell's own modules, not an inherited PS7/module path.
$env:PSModulePath = Join-Path $PSHOME 'Modules'
Set-StrictMode -Version Latest

function Test-Mailbox([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Length -gt 254 -or $Value -cne $Value.Trim()) { return $false }
  if ($Value -cnotmatch '^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+$') { return $false }
  $parts = $Value.Split('@'); $local = $parts[0]; $domain = $parts[1].ToLowerInvariant()
  if ($local.StartsWith('.') -or $local.EndsWith('.') -or $local.Contains('..')) { return $false }
  if ($domain -match '(^|\.)(invalid|test|example|localhost)$|(^|\.)example\.(com|net|org)$' -or -not $domain.Contains('.')) { return $false }
  foreach ($label in $domain.Split('.')) { if ($label -notmatch '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$') { return $false } }
  return $domain -match '\.[a-z]{2,}$'
}

function Get-GmailAliases([string]$Email, [string]$Tag) {
  if (-not (Test-Mailbox $Email) -or $Email.Split('@')[1].ToLowerInvariant() -cne 'gmail.com' -or $Tag -cnotmatch '^[a-f0-9]{16}$') { throw 'DOCUMENTED_PROVIDER_REQUIRED' }
  $local = $Email.Split('@')[0].Split('+')[0]
  $aliases = @(($local + '+ogh-a-' + $Tag + '@gmail.com'), ($local + '+ogh-b-' + $Tag + '@gmail.com'))
  if ($aliases.Count -ne 2 -or $aliases[0] -ieq $aliases[1] -or -not (Test-Mailbox $aliases[0]) -or -not (Test-Mailbox $aliases[1])) { throw 'ALIAS_VALIDATION' }
  return $aliases
}

if ($SelfTest) {
  $checks = 0
  foreach ($v in @('a@example.invalid','a@example.com','a@example.net','a@example.org','a@test','a@local.test','bad@@gmail.com','a..b@gmail.com',"a@gmail.com`n")) {
    if (Test-Mailbox $v) { throw 'OFFLINE_RESERVED_OR_SHAPE_FAILURE' }; $checks++
  }
  $a = @(Get-GmailAliases 'offline.fixture@gmail.com' '0123456789abcdef')
  if ($a.Count -ne 2 -or $a[0] -ieq $a[1]) { throw 'OFFLINE_ALIAS_FAILURE' }; $checks++
  if ((@(Get-GmailAliases 'offline.fixture+old@gmail.com' '0123456789abcdef'))[0] -cne $a[0]) { throw 'OFFLINE_EXISTING_PLUS_FAILURE' }; $checks++
  try { Get-GmailAliases 'a@other-provider.org' '0123456789abcdef' | Out-Null; throw 'OFFLINE_PROVIDER_ACCEPTED' } catch { if ($_.Exception.Message -cne 'DOCUMENTED_PROVIDER_REQUIRED') { throw } }; $checks++
  Write-Output ('{"offlineChecks":' + $checks + ',"productionRequests":0,"emailsSent":0}')
  exit 0
}

function Set-PrivateAcl([string]$Path, [bool]$IsDirectory) {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  if ($IsDirectory) {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit','None','Allow'))
  } else {
    $acl = [Security.AccessControl.FileSecurity]::new()
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))
  }
  $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false)
  # Windows PowerShell Set-Acl may request audit privileges even for this DACL-only change.
  if ($IsDirectory) { [IO.DirectoryInfo]::new($Path).SetAccessControl($acl) }
  else { [IO.FileInfo]::new($Path).SetAccessControl($acl) }
  $actual = Get-Acl -LiteralPath $Path
  $rules = @($actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  if (-not $actual.AreAccessRulesProtected -or $actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid.Value -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -cne $sid.Value -or $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl') { throw 'PRIVATE_ACL' }
}

function Write-ExclusiveJson([string]$Name, $Value) {
  $target = Join-Path $Directory $Name
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 12) + "`n")
  $stream = [IO.FileStream]::new($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  Set-PrivateAcl $target $false
  $readback = [IO.File]::ReadAllBytes($target)
  if ([Convert]::ToBase64String($readback) -cne [Convert]::ToBase64String($bytes)) { throw 'PRIVATE_READBACK' }
}

function Read-ValidMailbox([string]$Prompt) {
  for ($i = 0; $i -lt 3; $i++) {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [IntPtr]::Zero
    try { $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }; $secure.Dispose() }
    if (Test-Mailbox $value) { return $value }
    Write-Host 'Invalid/unsupported syntax or reserved domain. No network request was made.'
  }
  throw 'MAILBOX_INPUT_INVALID'
}

$privateReady = $false
$phase = 'STARTUP'
try {
  $Host.UI.RawUI.WindowTitle = 'OpenGlass Hub - Private Test Email Setup (LOCAL ONLY)'
  $root = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'OpenGlassHub'))
  $full = [IO.Path]::GetFullPath($Directory)
  if ([IO.Path]::GetDirectoryName($full) -cne $root -or [IO.Path]::GetFileName($full) -cnotmatch '^mailbox-[a-f0-9-]{36}$' -or (Test-Path -LiteralPath $full) -or $Namespace -cnotmatch '^ogh-pbeta-core-[0-9]{8}-[a-f0-9-]{36}$') { throw 'FRESH_PRIVATE_DIRECTORY_REQUIRED' }
  $walk = [IO.DirectoryInfo]::new($root)
  while ($null -ne $walk) { if ($walk.Exists -and (($walk.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'REPARSE_POINT' }; $walk = $walk.Parent }
  [IO.Directory]::CreateDirectory($full) | Out-Null
  $phase = 'PRIVATE_ACL'
  Set-PrivateAcl $full $true; $privateReady = $true
  $phase = 'PRIVATE_STARTED_RECEIPT'
  Write-ExclusiveJson 'input.started.safe.json' @{status='AWAITING_LOCAL_READ_HOST';utc=[DateTime]::UtcNow.ToString('o');productionRequests=0;emailsSent=0}
  if ($SetupProbe) { Write-ExclusiveJson 'probe.safe.json' @{status='REAL_LAUNCH_PRIVATE_IO_PASS';productionRequests=0;emailsSent=0}; exit 0 }
  $phase = 'READ_PRIMARY_EMAIL'
  Write-Host 'LOCAL ONLY: no Production requests, no email, no passwords requested.'
  $primary = Read-ValidMailbox 'Enter a real mailbox you control and can receive mail at'
  $phase = 'PRIMARY_PRIVATE_WRITE'
  Write-ExclusiveJson 'primary-email.private.json' @{email=$primary;ownerConfirmationPending=$true;productionAuthority=$false}
  if ($primary.Split('@')[1].ToLowerInvariant() -ceq 'gmail.com') {
    $phase = 'GMAIL_ALIASES'
    $tag = [Guid]::NewGuid().ToString('N').Substring(0,16)
    $aliases = @(Get-GmailAliases $primary $tag)
    $source = 'GMAIL_DOCUMENTED_PLUS_ADDRESSING'
    $providerEvidence = 'https://support.google.com/mail/answer/22370?hl=en'
  } else {
    $phase = 'MANUAL_ALIASES'
    Write-Host 'No plus-addressing assumption for this provider. Enter two distinct addresses/aliases you control.'
    $aliases = @((Read-ValidMailbox 'New synthetic A email'), (Read-ValidMailbox 'New synthetic B email'))
    $source = 'OWNER_SUPPLIED_TWO_RECEIVABLE_ADDRESSES'
    $providerEvidence = $null
  }
  if ($aliases.Count -ne 2 -or $aliases[0] -ieq $aliases[1]) { throw 'ALIASES_NOT_DISTINCT' }
  $phase = 'OWNER_CONFIRMATION'
  Write-Host 'Two distinct addresses are prepared privately; email text is not displayed or logged.'
  Write-Host 'Confirm BOTH are controlled by you, are unused for these tests, and can receive mail.'
  Write-Host 'No delivery was tested; your confirmation is recorded as owner attestation only.'
  if ((Read-Host 'Type OWNED_AND_RECEIVABLE to authorize these addresses for the pending test packet') -cne 'OWNED_AND_RECEIVABLE') { throw 'OWNER_CONFIRMATION_REQUIRED' }
  $utc = [DateTime]::UtcNow.ToString('o')
  $config = [ordered]@{schemaVersion=1;project='xcbnxzjlsvtgzixurcof';namespace=$Namespace;createdUTC=$utc;source='OWNER_READ_HOST';primaryEmail=$primary;aliasMethod=$source;providerEvidence=$providerEvidence;ownershipConfirmed=$true;receivabilityConfirmedByOwner=$true;deliveryVerified=$false;productionAuthority=$false;actors=@(@{alias='A';email=$aliases[0];newOnly=$true},@{alias='B';email=$aliases[1];newOnly=$true})}
  $phase = 'FINAL_CONFIG_WRITE'
  Write-ExclusiveJson 'mailboxes.private.json' $config
  $digest = (Get-FileHash -LiteralPath (Join-Path $Directory 'mailboxes.private.json') -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-ExclusiveJson 'setup.safe.json' ([ordered]@{status='LOCAL_EMAIL_SETUP_COMPLETE';utc=$utc;configSha256=$digest;aliases=2;distinct=$true;currentUserOnlyAcl='PASS';ownerReceivabilityAttested=$true;deliveryVerified=$false;productionRequests=0;emailsSent=0;credentialValuesReturned=$false})
  Write-Host 'Saved privately. No email address was returned to Codex output. You may close this window.'
} catch {
  $reason = if ($_.Exception.Message -cmatch '^[A-Z_]+$') { $_.Exception.Message } else { 'LOCAL_INPUT_OR_PERSISTENCE_UNCONFIRMED' }
  $failure = @{status='BLOCKED_LOCAL_MAILBOX_SETUP';phase=$phase;reason=$reason;exceptionType=$_.Exception.GetType().FullName;errorId=$_.FullyQualifiedErrorId;productionRequests=0;emailsSent=0}
  if ($Namespace -cmatch '^ogh-pbeta-core-[0-9]{8}-[a-f0-9-]{36}$') { try { [IO.File]::WriteAllText((Join-Path $env:LOCALAPPDATA ('OpenGlassHub\mailbox-launch-' + $Namespace.Substring($Namespace.Length-36) + '.safe.json')),($failure | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false)) } catch {} }
  if ($privateReady) { try { Write-ExclusiveJson 'setup.failure.safe.json' @{status='BLOCKED_LOCAL_MAILBOX_SETUP';reason=$reason;productionRequests=0;emailsSent=0} } catch {} }
  Write-Host 'BLOCKED_LOCAL_MAILBOX_SETUP. No Production request or email was sent.'
  Read-Host 'Press Enter to close this local setup window' | Out-Null
  exit 1
}
