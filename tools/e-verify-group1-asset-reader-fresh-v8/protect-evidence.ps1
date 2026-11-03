param([ValidateSet('Probe','Initialize','Protect','CheckHash','Unprotect')][string]$Operation,[string]$AuthorizationId,[string]$Directory)
$ErrorActionPreference='Stop'
try {
  if($AuthorizationId -cnotmatch '^e-verify-group1-[a-z0-9-]{1,160}$'){throw 'INVALID_CAPTURE_ID'}
  Add-Type -AssemblyName System.Security
  $entropy=[Text.Encoding]::UTF8.GetBytes('ogh-asset-reader:'+ $AuthorizationId)
  if($Operation -eq 'Probe'){
    $b=[Text.Encoding]::UTF8.GetBytes('LOCAL_CAPTURE_PROBE')
    $c=[Security.Cryptography.ProtectedData]::Protect($b,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $d=[Security.Cryptography.ProtectedData]::Unprotect($c,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    if([Convert]::ToBase64String($b) -cne [Convert]::ToBase64String($d)){throw 'PROBE_FAILED'}
    [Console]::Out.Write('PROTECTED_CAPTURE_READY'); exit 0
  }
  if($Operation -eq 'Initialize'){
    $full=[IO.Path]::GetFullPath($Directory)
    if(-not [IO.Path]::IsPathRooted($Directory) -or (Test-Path -LiteralPath $full)){throw 'FRESH_EVIDENCE_DIRECTORY_REQUIRED'}
    $walk=[IO.DirectoryInfo]::new($full).Parent
    while($null -ne $walk){if($walk.Exists -and (($walk.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)){throw 'REPARSE_POINT_FORBIDDEN'}; $walk=$walk.Parent}
    [IO.Directory]::CreateDirectory($full) | Out-Null
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl=[Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
    $inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',$inherit,'None','Allow'))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'FullControl',$inherit,'None','Allow'))
    Set-Acl -LiteralPath $full -AclObject $acl
    $check=Get-Acl -LiteralPath $full
    if($check.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid.Value -or -not $check.AreAccessRulesProtected){throw 'PRIVATE_ACL_FAILED'}
    [Console]::Out.Write('PRIVATE_EVIDENCE_READY');exit 0
  }
  $text=[Console]::In.ReadToEnd()
  if($text.Length -gt 3000000){throw 'CAPTURE_INPUT_BOUND'}
  $bytes=[Convert]::FromBase64String($text)
  if($Operation -eq 'Protect'){
    if($bytes.Length -gt 2097152){throw 'CAPTURE_BYTE_BOUND'}
    $encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Convert]::ToBase64String($encrypted));exit 0
  }
  $plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  if($Operation -eq 'Unprotect'){[Console]::Out.Write([Convert]::ToBase64String($plain));exit 0}
  $digest=[Security.Cryptography.SHA256]::Create().ComputeHash($plain)
  [Console]::Out.Write(([BitConverter]::ToString($digest)).Replace('-','').ToLowerInvariant());exit 0
}catch{[Console]::Out.Write('PROTECTED_CAPTURE_FAILED');exit 1}
