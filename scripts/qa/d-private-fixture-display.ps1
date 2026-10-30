$ErrorActionPreference = 'Stop'
try {
    $text = New-Object System.Text.StringBuilder
    while (($code = [Console]::In.Read()) -ne -1) {
        if ($text.Length -ge 4096) { throw 'INPUT_INVALID' }
        [void]$text.Append([char]$code)
    }
    $p = $text.ToString() | ConvertFrom-Json
    [void]$text.Clear()
    $fields = @($p.PSObject.Properties.Name | Sort-Object)
    if (($fields -join ',') -cne 'deadlineUtc,email,executionBindingSha256,password,purpose,schemaVersion' -or
        $p.schemaVersion -ne 1 -or $p.purpose -cne 'D_FIXTURE_ONLY' -or
        $p.executionBindingSha256 -cnotmatch '^[a-f0-9]{64}$' -or
        $p.email.Length -gt 254 -or $p.email -cnotmatch '^[a-zA-Z0-9._%+-]+\+ogh-d-[a-f0-9]{16}@gmail\.com$' -or
        $p.password -cnotmatch '^[a-zA-Z0-9_-]{48}$') { throw 'INPUT_INVALID' }
    $end = [DateTimeOffset]::ParseExact($p.deadlineUtc, 'yyyy-MM-ddTHH:mm:ss.fffZ',
        [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal)
    $remaining = ($end.UtcDateTime - [DateTime]::UtcNow).TotalMilliseconds
    if ($remaining -le 0) { throw 'INPUT_INVALID' }
    Add-Type -AssemblyName System.Windows.Forms
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'OpenGlass Hub - D Fixture Credential (Private Local Display)'
    $form.Width = 650; $form.Height = 240; $form.TopMost = $true
    $email = New-Object System.Windows.Forms.TextBox
    $email.SetBounds(15,25,600,30); $email.ReadOnly = $true; $email.ShortcutsEnabled = $false
    $email.Text = $p.email; $form.Controls.Add($email)
    $password = New-Object System.Windows.Forms.TextBox
    $password.SetBounds(15,70,600,30); $password.ReadOnly = $true; $password.ShortcutsEnabled = $false
    $password.UseSystemPasswordChar = $true; $password.Text = $p.password; $form.Controls.Add($password)
    $reveal = New-Object System.Windows.Forms.CheckBox
    $reveal.Text = 'Reveal locally for manual D login'; $reveal.SetBounds(15,115,550,30)
    $reveal.Add_CheckedChanged({ $password.UseSystemPasswordChar = -not $reveal.Checked })
    $form.Controls.Add($reveal)
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = [int][Math]::Min(120000, $remaining); $timer.Add_Tick({ $form.Close() }); $timer.Start()
    try { [void]$form.ShowDialog() } finally {
        $timer.Stop(); $timer.Dispose(); $email.Clear(); $password.Clear(); $form.Dispose(); $p = $null
    }
    exit 0
} catch { exit 1 }
