$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$projectDirectory = Split-Path -Parent $PSScriptRoot
$appUrl = 'http://127.0.0.1:4183'
$logDirectory = Join-Path $projectDirectory 'work\launcher'
$serverProcess = $null
$browserProcess = $null
$stdoutTask = $null
$stderrTask = $null

function Test-AppReady {
    try {
        $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match '<title>ConcurserO</title>'
    } catch {
        return $false
    }
}

try {
    if ([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains 4183) {
        throw 'A porta 4183 já está em uso. Encerre a execução anterior do ConcurserO antes de usar o atalho.'
    }

    $programFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
    $browserCandidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "$programFilesX86\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$programFilesX86\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    $browserPath = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $browserPath) { throw 'Instale o Google Chrome ou o Microsoft Edge para abrir a janela do ConcurserO.' }

    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $nodeVersion = & $nodePath --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) {
        throw 'Instale o Node.js 24 ou mais recente para abrir o ConcurserO.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'node_modules\express\package.json'))) {
        throw 'As dependências não estão instaladas. Execute npm.cmd ci na pasta do projeto.'
    }

    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'dist\index.html'))) {
        $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
        Push-Location -LiteralPath $projectDirectory
        try {
            & $npmPath run build *> (Join-Path $logDirectory 'build.log')
            if ($LASTEXITCODE -ne 0) { throw "Não foi possível preparar a aplicação. Consulte $logDirectory\build.log" }
        } finally {
            Pop-Location
        }
    }

    $serverProcess = New-Object System.Diagnostics.Process
    $serverProcess.StartInfo.FileName = $nodePath
    $serverProcess.StartInfo.Arguments = '"' + (Join-Path $projectDirectory 'server\desktop.ts') + '"'
    $serverProcess.StartInfo.WorkingDirectory = $projectDirectory
    $serverProcess.StartInfo.UseShellExecute = $false
    $serverProcess.StartInfo.CreateNoWindow = $true
    $serverProcess.StartInfo.RedirectStandardInput = $true
    $serverProcess.StartInfo.RedirectStandardOutput = $true
    $serverProcess.StartInfo.RedirectStandardError = $true
    $serverProcess.StartInfo.EnvironmentVariables['CONCURSERO_PORT'] = '4183'
    $serverProcess.StartInfo.EnvironmentVariables['CONCURSERO_DATA'] = Join-Path $projectDirectory 'data'
    $serverProcess.Start() | Out-Null
    $stdoutTask = $serverProcess.StandardOutput.ReadToEndAsync()
    $stderrTask = $serverProcess.StandardError.ReadToEndAsync()

    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    while (-not (Test-AppReady)) {
        if ($serverProcess.HasExited) { throw "O servidor não iniciou. Consulte $logDirectory\server-error.log" }
        if ([DateTime]::UtcNow -ge $deadline) { throw "O servidor demorou para responder. Consulte os registros em $logDirectory" }
        Start-Sleep -Milliseconds 300
    }

    # A separate browser profile makes this window independent of personal tabs.
    $profileDirectory = Join-Path $projectDirectory 'work\desktop-browser'
    $browserArguments = '--app=' + $appUrl + ' --user-data-dir="' + $profileDirectory + '" --no-first-run --no-default-browser-check --disable-background-mode'
    # This is the visible application window requested by the user.
    $browserProcess = Start-Process -FilePath $browserPath -ArgumentList $browserArguments -PassThru

    $windowOpened = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    while (-not $browserProcess.HasExited) {
        $browserProcess.Refresh()
        if ($browserProcess.MainWindowHandle -ne [IntPtr]::Zero) {
            if (-not $windowOpened) {
                [Console]::WriteLine('ConcurserO:WindowOpened')
                $windowOpened = $true
            }
        } elseif ($windowOpened) {
            break
        } elseif ([DateTime]::UtcNow -ge $deadline) {
            throw 'A janela do ConcurserO não abriu no tempo esperado.'
        }
        if ($serverProcess.HasExited) { throw "O servidor foi interrompido. Consulte $logDirectory\server-error.log" }
        Start-Sleep -Milliseconds 300
    }
    if (-not $windowOpened) { throw 'O navegador encerrou antes de abrir a janela do ConcurserO.' }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    # Stop only the server created by this launcher, allowing requests to finish.
    if ($null -ne $serverProcess) {
        if ($null -ne $stdoutTask) {
            if (-not $serverProcess.HasExited) {
                $serverProcess.StandardInput.Close()
                if (-not $serverProcess.WaitForExit(7000)) {
                    $serverProcess.Kill()
                    $serverProcess.WaitForExit()
                }
            }
            $stdoutTask.GetAwaiter().GetResult() | Set-Content -LiteralPath (Join-Path $logDirectory 'server.log') -Encoding UTF8
            $stderrTask.GetAwaiter().GetResult() | Set-Content -LiteralPath (Join-Path $logDirectory 'server-error.log') -Encoding UTF8
        }
        $serverProcess.Dispose()
    }
    if ($null -ne $browserProcess) {
        if (-not $browserProcess.HasExited) { $browserProcess.Kill() }
        $browserProcess.Dispose()
    }
}
