function Publish-DLocalRecord([string]$File,$Value) {
    $data=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 30 -Compress))
    $staging=$File+'.publishing'
    $stream=[IO.File]::Open($staging,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$stream.Write($data,0,$data.Length);$stream.Flush($true)} finally {$stream.Dispose()}
    if([Convert]::ToBase64String([IO.File]::ReadAllBytes($staging)) -cne [Convert]::ToBase64String($data)){
        throw 'LOCAL_RECEIPT_UNPROVEN'
    }
    # Same-directory no-replace publication: final existence now means sealed bytes.
    [IO.File]::Move($staging,$File)
}

function Seal-LocalRecord([string]$File,$Value) {
    try {Publish-DLocalRecord $File $Value}
    catch {
        # Never reuse the terminal filename for a contradictory STOPPED record.
        try {Publish-DLocalRecord ($File+'.failure.safe.json') ([ordered]@{
            kind='LOCAL_RECEIPT_PUBLICATION_FAILURE';status='STOPPED';stage='LOCAL_RECEIPT_PUBLICATION'
            recordedUtc=[DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        })} catch {}
        throw 'LOCAL_RECEIPT_PUBLICATION_FAILED'
    }
}
