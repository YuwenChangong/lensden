param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
function Validate-Payload($p) {
    if ($p.binding -cnotmatch '^[a-f0-9]{64}$' -or $p.actor -cnotmatch '^(A3|B3)$' -or
        $p.email -cnotmatch '^[a-zA-Z0-9._%+-]+\+ogh-(a3|b3)-[a-f0-9]{16}@gmail\.com$' -or
        $p.password -cnotmatch '^[a-zA-Z0-9_-]{32,128}$') { throw 'INPUT_INVALID' }
    if (($p.actor -ceq 'A3' -and $p.email -cnotmatch '\+ogh-a3-') -or
        ($p.actor -ceq 'B3' -and $p.email -cnotmatch '\+ogh-b3-')) { throw 'INPUT_INVALID' }
}
if ($ValidateOnly) {
    $base = @{binding=('a' * 64); actor='A3'; email='fixture+ogh-a3-0123456789abcdef@gmail.com'; password=('x' * 40)}
    Validate-Payload $base
    foreach ($field in @('binding','actor','email','password')) {
        $bad = $base.Clone(); $bad[$field] = 'invalid'
        $blocked = $false
        try { Validate-Payload $bad } catch { $blocked = $true }
        if (-not $blocked) { throw 'TEST_FAILED' }
    }
    Write-Output 'LOCAL_VALIDATION=5/5_PASS_NO_REAL_SECRET_NO_GUI'
    exit 0
}
try {
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Validate-Payload $payload
    Add-Type -AssemblyName System.Windows.Forms
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'OpenGlass Hub - Synthetic Credential (LOCAL PRIVATE ONLY)'
    $form.Width = 650; $form.Height = 245; $form.TopMost = $true
    $label = New-Object System.Windows.Forms.Label
    $label.Text = 'Only enter these new synthetic credentials in the approved ordinary Edge profile.'
    $label.SetBounds(15,15,610,40); $form.Controls.Add($label)
    $email = New-Object System.Windows.Forms.TextBox
    $email.SetBounds(15,60,600,30); $email.ReadOnly = $true; $email.Text = $payload.email; $form.Controls.Add($email)
    $password = New-Object System.Windows.Forms.TextBox
    $password.SetBounds(15,100,600,30); $password.ReadOnly = $true
    $password.UseSystemPasswordChar = $true; $password.Text = $payload.password; $form.Controls.Add($password)
    $reveal = New-Object System.Windows.Forms.CheckBox
    $reveal.Text = 'Reveal locally for manual entry'; $reveal.SetBounds(15,145,350,30)
    $reveal.Add_CheckedChanged({$password.UseSystemPasswordChar = -not $reveal.Checked}); $form.Controls.Add($reveal)
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 120000; $timer.Add_Tick({$form.Close()}); $timer.Start()
    try { [void]$form.ShowDialog() } finally {
        $timer.Stop(); $timer.Dispose(); $email.Clear(); $password.Clear(); $form.Dispose()
        $payload = $null
    }
    Write-Output 'PRIVATE_WINDOW_CLOSED_LOGIN_NOT_INFERRED'
} catch { Write-Output 'PRIVATE_WINDOW_BLOCKED_NO_SECRET_OUTPUT'; exit 1 }
