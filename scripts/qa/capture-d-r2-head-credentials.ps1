param(
    [Parameter(Mandatory=$true)][string]$Nonce,
    [Parameter(Mandatory=$true)][string]$Binding,
    [Parameter(Mandatory=$true)][string]$WindowEndUTC,
    [Parameter(Mandatory=$true)][string]$StatusDirectory,
    [switch]$OfflineFixture
)
$ErrorActionPreference='Stop'
$pipe=$null;$secrets=@();$pointers=@();$plain=@();$bytes=$null;$watchdog=$null;$ack=$null
try {
    # Older hosts must not silently omit the same-user pipe protection.
    if(-not ([Enum]::GetNames([IO.Pipes.PipeOptions]) -contains 'CurrentUserOnly')){throw 'UNSUPPORTED_SECURE_PIPE_HOST'}
    if($Nonce -cnotmatch '^[a-f0-9-]{36}$' -or $Binding -cnotmatch '^[a-f0-9]{64}$'){throw 'INVALID_SCOPE'}
    if(($OfflineFixture -and $Binding -cne ('0'*64)) -or (-not $OfflineFixture -and $Binding -ceq ('0'*64))){throw 'FIXTURE_SCOPE'}
    $end=[DateTimeOffset]::ParseExact($WindowEndUTC,'yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal)
    if([DateTimeOffset]::UtcNow -ge $end){throw 'WINDOW_EXPIRED'}
    Add-Type -TypeDefinition 'public static class OghHeadInputDeadline { public static System.Threading.Timer Start(int milliseconds) { return new System.Threading.Timer(_ => System.Environment.Exit(124), null, milliseconds, System.Threading.Timeout.Infinite); } }'
    $watchdog=[OghHeadInputDeadline]::Start([int][Math]::Max(1,[Math]::Min(120000,($end-[DateTimeOffset]::UtcNow).TotalMilliseconds)))
    $directory=[IO.Path]::GetFullPath($StatusDirectory)
    $allowed=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'OpenGlassHub'))+[IO.Path]::DirectorySeparatorChar
    if(-not $directory.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $directory -PathType Container)){throw 'PRIVATE_DIRECTORY_REQUIRED'}
    $cursor=Get-Item -LiteralPath $directory
    $stop=$allowed.TrimEnd([IO.Path]::DirectorySeparatorChar)
    while($null -ne $cursor) {
        if($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PRIVATE_DIRECTORY_REQUIRED'}
        if($cursor.FullName.Equals($stop,[StringComparison]::OrdinalIgnoreCase)){break}
        $cursor=$cursor.Parent
    }
    if($null -eq $cursor){throw 'PRIVATE_DIRECTORY_REQUIRED'}
    $sids=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18')
    foreach($rule in (Get-Acl -LiteralPath $directory).Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $sids){throw 'PRIVATE_ACL_REQUIRED'}}
    $prefix=if($OfflineFixture){'OGHR2HeadCredentials-Fixture-'}else{'OGHR2HeadCredentials-'}
    $pipe=[IO.Pipes.NamedPipeServerStream]::new(($prefix+$Nonce),[IO.Pipes.PipeDirection]::InOut,1,[IO.Pipes.PipeTransmissionMode]::Byte,
        ([IO.Pipes.PipeOptions]::Asynchronous -bor [IO.Pipes.PipeOptions]::CurrentUserOnly))
    $file=Join-Path $directory ('head-input.'+$Nonce+'.ready.safe.json')
    $ready=[Text.Encoding]::UTF8.GetBytes((@{schemaVersion=1;binding=$Binding;nonce=$Nonce;pid=$PID;status='LOCAL_CURRENT_USER_PIPE_READY';productionRequests=0}|ConvertTo-Json -Compress))
    $stream=[IO.File]::Open(($file+'.publishing'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($ready,0,$ready.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    [IO.File]::Move(($file+'.publishing'),$file)
    Write-Output 'LOCAL_WAITING_FOR_BOUND_NATIVE_RECEIVER_DO_NOT_CREATE_TOKEN'
    $cancel=[Threading.CancellationTokenSource]::new([int][Math]::Max(1,[Math]::Min(120000,($end-[DateTimeOffset]::UtcNow).TotalMilliseconds)))
    try{$pipe.WaitForConnectionAsync($cancel.Token).GetAwaiter().GetResult()}finally{$cancel.Dispose()}
    $expected=[Text.Encoding]::ASCII.GetBytes(('OGH_HEAD_RECEIVER_V1 '+$Binding+' '+$Nonce+"`n"))
    $ack=[byte[]]::new($expected.Length);$offset=0
    while($offset -lt $ack.Length){$n=$pipe.Read($ack,$offset,$ack.Length-$offset);if($n -eq 0){throw 'RECEIVER_NOT_BOUND'};$offset+=$n}
    if([DateTimeOffset]::UtcNow -ge $end -or [Convert]::ToBase64String($ack) -cne [Convert]::ToBase64String($expected)){throw 'RECEIVER_NOT_BOUND'}
    Write-Output 'LOCAL_BOUND_NATIVE_RECEIVER_CONNECTED_NO_PRODUCTION_REQUEST'
    if($OfflineFixture){$plain=@(('a'*32),('b'*64),'FICTITIOUS_SESSION_TOKEN_ONLY')}
    else {
        $Host.UI.RawUI.WindowTitle='OpenGlass Hub - R2 HEAD Credentials (LOCAL PRIVATE ONLY)'
        Write-Host 'Target: dcb374166b39234a499985145c075f50 / default / openglasshub-media'
        Write-Host 'Only separately authorized, short-lived Object Read Only S3 credentials.'
        Write-Host 'Do not enter an OAuth token, parent API token, account password or TOTP.'
        foreach($label in @('S3 Access Key ID','S3 Secret Access Key','S3 Session Token (blank only for an expiring bucket token)')) {
            $secret=Read-Host $label -AsSecureString;$secrets+=,$secret
            $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret);$pointers+=,$ptr
            $plain+=,[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        }
    }
    if($plain[0] -cnotmatch '^[a-zA-Z0-9]{16,128}$' -or $plain[1] -cnotmatch '^[a-zA-Z0-9/+=]{32,256}$' -or
        $plain[2].Length -gt 8192 -or $plain[2] -match '[^\x21-\x7e]' -or [DateTimeOffset]::UtcNow -ge $end){throw 'INVALID_CREDENTIAL_INPUT'}
    if([DateTimeOffset]::UtcNow -ge $end){throw 'WINDOW_EXPIRED'}
    $frame=@{schemaVersion=1;binding=$Binding;nonce=$Nonce;accessKeyId=$plain[0];secretAccessKey=$plain[1]}
    if($plain[2].Length){$frame.sessionToken=$plain[2]}
    $bytes=[Text.Encoding]::UTF8.GetBytes(($frame|ConvertTo-Json -Compress))
    $pipe.Write($bytes,0,$bytes.Length);$pipe.Flush()
    Write-Output 'LOCAL_S3_CREDENTIAL_TRANSFER_COMPLETE_NO_PRODUCTION_REQUEST'
}catch{
    if($_.Exception.Message -ceq 'UNSUPPORTED_SECURE_PIPE_HOST'){
        Write-Output 'SAFE_LOCAL_S3_CREDENTIAL_INPUT_FAILURE_UNSUPPORTED_SECURE_PIPE_HOST'
    }else{Write-Output 'SAFE_LOCAL_S3_CREDENTIAL_INPUT_FAILURE'}
    exit 1
}
finally {
    if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
    if($ack){[Array]::Clear($ack,0,$ack.Length)}
    foreach($ptr in $pointers){if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}}
    foreach($secret in $secrets){$secret.Dispose()}
    if($pipe){$pipe.Dispose()};if($watchdog){$watchdog.Dispose()}
    $plain=$null;$frame=$null
}
