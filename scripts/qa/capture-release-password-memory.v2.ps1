param(
    [Parameter(Mandatory=$true)][string]$PipeName,
    [Parameter(Mandatory=$true)][string]$Binding,
    [Parameter(Mandatory=$true)][string]$Nonce,
    [Parameter(Mandatory=$true)][string]$WindowEndUTC,
    [Parameter(Mandatory=$true)][string]$StatusDirectory,
    [switch]$OfflineFixture
)
$ErrorActionPreference='Stop'
$pipe=$null;$secret=$null;$ptr=[IntPtr]::Zero;$bytes=$null;$plain=$null;$watchdog=$null
try {
    if($PipeName -cnotmatch '^OGHReleasePassword-(Fixture-)?[a-f0-9-]{36}$' -or $Binding -cnotmatch '^[a-f0-9]{64}$' -or $Nonce -cnotmatch '^[a-f0-9-]{36}$'){throw 'INVALID_SCOPE'}
    $end=[DateTimeOffset]::ParseExact($WindowEndUTC,'yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal)
    if([DateTimeOffset]::UtcNow -ge $end){throw 'WINDOW_EXPIRED'}
    Add-Type -TypeDefinition 'public static class OghPasswordInputDeadline { public static System.Threading.Timer Start(int milliseconds) { return new System.Threading.Timer(_ => System.Environment.Exit(124), null, milliseconds, System.Threading.Timeout.Infinite); } }'
    $watchdog=[OghPasswordInputDeadline]::Start([int][Math]::Max(1,[Math]::Min(120000,($end-[DateTimeOffset]::UtcNow).TotalMilliseconds)))
    if($OfflineFixture -and (-not $PipeName.StartsWith('OGHReleasePassword-Fixture-') -or $Binding -cne ('0'*64))){throw 'FIXTURE_SCOPE'}
    if(-not $OfflineFixture -and $PipeName.StartsWith('OGHReleasePassword-Fixture-')){throw 'FIXTURE_SCOPE'}
    $directory=[IO.Path]::GetFullPath($StatusDirectory)
    $allowed=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'OpenGlassHub'))+[IO.Path]::DirectorySeparatorChar
    if(-not $directory.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $directory -PathType Container)){throw 'PRIVATE_DIRECTORY_REQUIRED'}
    $allowedSids=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
    if((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PRIVATE_DIRECTORY_REQUIRED'}
    foreach($rule in (Get-Acl -LiteralPath $directory).Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowedSids){throw 'PRIVATE_ACL_REQUIRED'}}
    $options=[IO.Pipes.PipeOptions]::Asynchronous -bor [IO.Pipes.PipeOptions]::CurrentUserOnly
    $pipe=[IO.Pipes.NamedPipeServerStream]::new($PipeName,[IO.Pipes.PipeDirection]::Out,1,[IO.Pipes.PipeTransmissionMode]::Byte,$options)
    $ready=[Text.Encoding]::UTF8.GetBytes(([ordered]@{schemaVersion=1;binding=$Binding;nonce=$Nonce;status='LOCAL_CURRENT_USER_PIPE_READY';pid=$PID;productionRequests=0}|ConvertTo-Json -Compress))
    $file=Join-Path $directory ('hidden-input.'+$Nonce+'.ready.safe.json')
    # Publish only after the exclusive writer is closed; never overwrite an old marker.
    $publishing=$file+'.publishing'
    $stream=[IO.File]::Open($publishing,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($ready,0,$ready.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    [IO.File]::Move($publishing,$file)
    if($OfflineFixture){$plain='NONSECRET_LOCAL_FIXTURE_@:/?#%+_unicode_'+[char]0x6D4B}
    else {
        $Host.UI.RawUI.WindowTitle='OpenGlass Hub - Current Database Password (local hidden input)'
        Write-Host 'Target: xcbnxzjlsvtgzixurcof / postgres.xcbnxzjlsvtgzixurcof / Session Pooler 5432'
        Write-Host 'Enter the CURRENT DATABASE PASSWORD only. Not an API key, URL or recovery passphrase.'
        Write-Host 'Nothing is saved to a credential file. Do not paste secrets into chat.'
        $secret=Read-Host 'Current trusted database password' -AsSecureString
        if($secret.Length -lt 1 -or $secret.Length -gt 1024){throw 'PASSWORD_REQUIRED'}
        $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    if([DateTimeOffset]::UtcNow -ge $end -or $plain -match '[\x00\r\n]' -or $plain -match '^(sb_secret_|sb_publishable_|sbp_)' -or $plain -match '^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'){throw 'DATABASE_PASSWORD_REQUIRED_NOT_API_KEY'}
    $cancel=[Threading.CancellationTokenSource]::new(120000)
    try{$pipe.WaitForConnectionAsync($cancel.Token).GetAwaiter().GetResult()}finally{$cancel.Dispose()}
    if([DateTimeOffset]::UtcNow -ge $end){throw 'WINDOW_EXPIRED'}
    $bytes=[Text.Encoding]::UTF8.GetBytes((@{schemaVersion=1;binding=$Binding;nonce=$Nonce;password=$plain}|ConvertTo-Json -Compress))
    $pipe.Write($bytes,0,$bytes.Length);$pipe.Flush()
    Write-Output 'LOCAL_PASSWORD_TRANSFER_COMPLETE_NO_DATABASE_CONNECTION'
} catch {Write-Output 'SAFE_LOCAL_PASSWORD_INPUT_FAILURE';exit 1}
finally {
    if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
    if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
    if($secret){$secret.Dispose()}
    if($pipe){$pipe.Dispose()}
    if($watchdog){$watchdog.Dispose()}
    $plain=$null
}
