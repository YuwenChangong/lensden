param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$Binding,
  [switch]$OwnerExplicitApprovalConfirmed
)
$ErrorActionPreference = 'Stop'
if (-not $OwnerExplicitApprovalConfirmed.IsPresent) { throw 'FRESH_HUMAN_APPROVAL_REQUIRED_NOT_A_HASH_ONLY' }
$packetPath = 'C:\Temp\ogh-admin-mfa-activation-20261024\ADMIN_MFA_ACTIVATION.RESUME.v5.NOT_AUTHORIZED.json'
if ((Get-FileHash -LiteralPath $packetPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $binding) { throw 'PACKET_IDENTITY_MISMATCH' }
$packet = Get-Content -LiteralPath $packetPath -Raw | ConvertFrom-Json -DateKind String
foreach ($pin in $packet.localAdmissionTools.sourcePins) {
  if ((Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256) { throw 'LOCAL_ADMISSION_TOOL_IDENTITY' }
}
$destination = Join-Path $env:LOCALAPPDATA "OpenGlassHub\admin-mfa-activation\$binding"
New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
$cursor = Get-Item -LiteralPath (Split-Path $destination -Parent)
while ($null -ne $cursor) {
  if (($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'PRIVATE_PATH_REPARSE_POINT' }
  $cursor = $cursor.Parent
}
if (Test-Path -LiteralPath $destination) { throw 'APPROVAL_ALREADY_RECORDED_OR_PATH_USED' }
New-Item -ItemType Directory -Path $destination | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true, $false)
foreach ($identity in @($sid, $system)) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')) }
Set-Acl -LiteralPath $destination -AclObject $acl
$actual = Get-Acl -LiteralPath $destination
if (-not $actual.AreAccessRulesProtected -or $actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'PRIVATE_ACL_UNCONFIRMED' }
$rules = $actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
if ($rules.Count -ne 2) { throw 'PRIVATE_ACL_UNEXPECTED_RULES' }
foreach ($rule in $rules) { if ($rule.IdentityReference.Value -notin @($sid.Value, $system.Value) -or $rule.AccessControlType -ne 'Allow' -or $rule.IsInherited) { throw 'PRIVATE_ACL_UNEXPECTED_IDENTITY' } }
$start = [DateTime]::UtcNow
$receipt = [ordered]@{
  task = 'ADMIN_MFA_PRODUCTION_ACTIVATION'
  binding = $binding
  ownerApproval = 'FRESH_HUMAN_MESSAGE_EXACT_BINDING_LOGIN_READY_AND_ALL_TRUE_CONDITIONS_CONFIRMED_NOT_INFERRED_FROM_HASH'
  approvalFields = $packet.approvalFieldsRequired
  recordedUTC = $start.ToString('o')
  executionWindowEndUTC = $start.AddMinutes(180).ToString('o')
  separateInitialAdmissionDeadline = $null
  minimumRemainingStageMinutes = @{enrollment=45;enforcement=30;database=15}
  directoryACL = 'CURRENT_USER_AND_SYSTEM_ONLY_VERIFIED'
  status = 'FRESH_ADMISSION_PENDING'
  managementReads = 0
  deployments = 0
  databaseConnections = 0
  migrations = 0
  factorWrites = 0
  retries = 0
  publicBetaGo = 'NOT_AUTHORIZED'
}
$file = Join-Path $destination 'owner-approval.safe.json'
$bytes = [Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json -Depth 8) + "`n")
$handle = [IO.File]::Open($file, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $handle.Write($bytes, 0, $bytes.Length); $handle.Flush($true) } finally { $handle.Dispose() }
$readback = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json -DateKind String
if ($readback.binding -ne $binding -or $readback.recordedUTC -cne $receipt.recordedUTC) { throw 'APPROVAL_READBACK_FAILED' }
[ordered]@{binding=$binding;recordedUTC=$receipt.recordedUTC;executionWindowEndUTC=$receipt.executionWindowEndUTC;privateACL='PASS';productionOperations=0} | ConvertTo-Json -Compress
