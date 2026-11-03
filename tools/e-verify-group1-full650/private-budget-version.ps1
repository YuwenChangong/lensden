param()
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'OpenGlassHub\acceptance-input\e-verify-20261012'
$source=Join-Path $root 'STATEFUL_PRIVATE_BINDING_WORKING.json'
$target=Join-Path $root 'STATEFUL_PRIVATE_BINDING_GROUP1_650_V1.json'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
$system=[Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$acl=Get-Acl -LiteralPath $root
if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $identity.Value){throw 'PRIVATE_OWNER_MISMATCH'}
foreach($ace in $acl.Access){if($ace.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($identity.Value,$system.Value,'S-1-5-32-544')){throw 'PRIVATE_DIRECTORY_PERMISSIONS_TOO_BROAD'}}
if(Test-Path -LiteralPath $target){throw 'PRIVATE_VERSION_EXISTS'}
$ruleAcl=[Security.AccessControl.FileSecurity]::new()
$ruleAcl.SetOwner($identity)
$ruleAcl.SetAccessRuleProtection($true,$false)
foreach($sid in @($identity,$system)){$ruleAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow))}
$originalBytes=[IO.File]::ReadAllBytes($source)
$sha=[Security.Cryptography.SHA256]::Create()
try{
 $oldHash=([BitConverter]::ToString($sha.ComputeHash($originalBytes))).Replace('-','').ToLowerInvariant()
 if($oldHash -cne 'fadbb0ffde9e4a7dcbcf232143738f547e0a70ef7750983beab6bafc44095678'){throw 'PRIVATE_BASELINE_CHANGED'}
 $value=[Text.Encoding]::UTF8.GetString($originalBytes)|ConvertFrom-Json
 if($value.budget.allBrowserHttpDispatchesMax -ne 500 -or $value.budget.openaiAndProviderCostUSDMax -ne 0){throw 'PRIVATE_BUDGET_BASELINE_CHANGED'}
 $value.budget.allBrowserHttpDispatchesMax=650
 $stream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{
  # Preserve the trusted owner/SYSTEM/Administrators parent. The new file is empty
  # until inheritance is removed and owner/SYSTEM-only rules are applied.
  Set-Acl -LiteralPath $target -AclObject $ruleAcl
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 40)+[Environment]::NewLine)
  $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
 }finally{$stream.Dispose()}
 if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $oldHash){throw 'PRIVATE_ORIGINAL_CHANGED'}
 $finalAcl=Get-Acl -LiteralPath $target
 foreach($ace in $finalAcl.Access){if($ace.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($identity.Value,$system.Value)){throw 'PRIVATE_VERSION_PERMISSIONS_INVALID'}}
 [pscustomobject]@{BudgetAmendment='APPLIED';GlobalAdmissionMax=650;Original500Preserved=$true;VersionSha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant();PrivateValuesPrinted=$false;ProductionRequests=0;ProductionWrites=0}|ConvertTo-Json -Compress
}finally{$sha.Dispose()}
