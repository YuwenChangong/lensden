param([string]$Directory,[string]$Namespace)
$ErrorActionPreference='Stop'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
function Check-Path([string]$target,[bool]$directoryRoot=$false) {
  $item=Get-Item -LiteralPath $target -Force
  $walk=$item
  while($null -ne $walk){
    if(($walk.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'REPARSE'}
    if($walk -is [IO.FileInfo]){$walk=$walk.Directory}else{$walk=$walk.Parent}
  }
  $acl=Get-Acl -LiteralPath $target
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid.Value){throw 'OWNER'}
  if($directoryRoot -and -not $acl.AreAccessRulesProtected){throw 'INHERITANCE'}
  $rules=$acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
  $seen=@{}
  foreach($rule in $rules){
    $who=$rule.IdentityReference.Value
    if($who -cne $sid.Value -and $who -cne 'S-1-5-18'){throw 'ACL_PRINCIPAL'}
    if($rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl'){throw 'ACL_RIGHTS'}
    $seen[$who]=$true
  }
  if(-not $seen[$sid.Value] -or -not $seen['S-1-5-18']){throw 'ACL_MISSING'}
}
function Reply($value){[Console]::Out.WriteLine(($value | ConvertTo-Json -Compress -Depth 8));[Console]::Out.Flush()}
try {
  if($Namespace -cnotmatch '^e-verify-group1-offline-origin-[a-f0-9]{32}$'){throw 'NAMESPACE'}
  Add-Type -AssemblyName System.Security
  $Directory=[IO.Path]::GetFullPath($Directory)
  Check-Path $Directory $true
  $entropy=[Text.Encoding]::UTF8.GetBytes('ogh-asset-reader:'+$Namespace)
  Reply @{ok=$true;ready=$true}
  $writes=0
  while($null -ne ($line=[Console]::In.ReadLine())){
    try {
      if($line.Length -gt 4096){throw 'INPUT_BOUND'}
      $q=$line | ConvertFrom-Json
      Check-Path $Directory $true
      if($q.op -eq 'close'){Reply @{ok=$true};exit 0}
      if($q.op -eq 'destroy'){
        foreach($file in [IO.Directory]::GetFiles($Directory)){
          if([IO.Path]::GetFileName($file) -cnotmatch '^origin-[a-f0-9]{32}\.dpapi$'){throw 'FILE_SCOPE'}
          Check-Path $file
        }
        if([IO.Directory]::GetDirectories($Directory).Length -ne 0){throw 'DIRECTORY_SCOPE'}
        foreach($file in [IO.Directory]::GetFiles($Directory)){[IO.File]::Delete($file)}
        [IO.Directory]::Delete($Directory);Reply @{ok=$true};exit 0
      }
      if($q.ref -cnotmatch '^origin-[a-f0-9]{32}$'){throw 'REFERENCE'}
      $file=[IO.Path]::Combine($Directory,$q.ref+'.dpapi')
      if($q.op -eq 'capture'){
        if($writes -ge 16 -or (Test-Path -LiteralPath $file)){throw 'CAPTURE_BOUND'}
        $o=$q.origin
        if($o.scheme -cne 'https:' -or $o.host -cnotmatch '^[a-z0-9.-]{1,253}$' -or $o.port -cnotmatch '^[0-9]{1,5}$'){throw 'ORIGIN'}
        $expiry=[DateTimeOffset]::Parse($q.expiresUTC)
        if($expiry -le [DateTimeOffset]::UtcNow -or $expiry -gt [DateTimeOffset]::UtcNow.AddHours(24)){throw 'EXPIRY'}
        $plain=[Text.Encoding]::UTF8.GetBytes((@{namespace=$Namespace;expiresUTC=$q.expiresUTC;origin=@{scheme=$o.scheme;host=$o.host;port=$o.port}} | ConvertTo-Json -Compress))
        try{$cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}finally{[Array]::Clear($plain,0,$plain.Length)}
        $stream=[IO.File]::Open($file,'CreateNew','Write','None')
        try{$stream.Write($cipher,0,$cipher.Length)}finally{$stream.Dispose()}
        Check-Path $file
        $writes++
        $hash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($cipher))).Replace('-','').ToLowerInvariant()
        Reply @{ok=$true;ref=$q.ref;sha256=$hash};continue
      }
      if($q.op -eq 'read'){
        Check-Path $file
        if((Get-Item -LiteralPath $file).Length -gt 8192){throw 'FILE_BOUND'}
        $cipher=[IO.File]::ReadAllBytes($file)
        $hash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($cipher))).Replace('-','').ToLowerInvariant()
        if($hash -cne $q.sha256){throw 'HASH'}
        $plain=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        try{$data=[Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json}finally{[Array]::Clear($plain,0,$plain.Length)}
        if($data.namespace -cne $Namespace -or [DateTimeOffset]::Parse($data.expiresUTC) -le [DateTimeOffset]::UtcNow){throw 'EXPIRED_OR_NAMESPACE'}
        Reply @{ok=$true;origin=$data.origin};continue
      }
      throw 'OPERATION'
    }catch{Reply @{ok=$false;code='PROTECTED_ORIGIN_OPERATION_FAILED'}}
  }
}catch{Reply @{ok=$false;code='PROTECTED_ORIGIN_UNAVAILABLE'};exit 1}
