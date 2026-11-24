<#
.SYNOPSIS
Importa questoes da IBFC no banco offline do ConcurserO.
.PARAMETER PaginaInicial
Pagina do Gran em que a busca deve comecar.
.PARAMETER TamanhoPagina
Quantidade solicitada ao Gran por pagina.
.PARAMETER MaxPaginas
Quantidade de paginas nesta execucao. Zero percorre ate a ultima pagina.
.PARAMETER PausaSegundos
Tempo de espera entre consultas. O padrao e 5 segundos.
.PARAMETER TodasDisciplinas
Busca na IBFC sem o recorte das disciplinas do edital do Parana de 2024.
.PARAMETER ExportarPara
Grava as paginas recebidas em JSON na pasta indicada.
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 2147483647)][int]$PaginaInicial = 1,
    [ValidateRange(1, 1000)][int]$TamanhoPagina = 100,
    [ValidateRange(0, 2147483647)][int]$MaxPaginas = 0,
    [ValidateRange(1, 2147483)][int]$PausaSegundos = 5,
    [switch]$TodasDisciplinas,
    [ValidateNotNullOrEmpty()][string]$ExportarPara
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$node = (Get-Command node -CommandType Application).Source
$runner = Join-Path $PSScriptRoot 'importar-questoes-ibfc.ts'
$sessionDirectory = Join-Path $env:LOCALAPPDATA 'ConcurserO'
$sessionPath = Join-Path $sessionDirectory 'gran-ibfc-session.xml'

function Save-GranSession($session) {
    $temporaryPath = Join-Path $sessionDirectory ([System.Guid]::NewGuid().ToString() + '.tmp')
    try {
        $null = [System.IO.Directory]::CreateDirectory($sessionDirectory)
        Export-Clixml -InputObject $session -LiteralPath $temporaryPath -ErrorAction Stop
        if ([System.IO.File]::Exists($sessionPath)) {
            [System.IO.File]::Replace($temporaryPath, $sessionPath, [NullString]::Value)
        } else {
            [System.IO.File]::Move($temporaryPath, $sessionPath)
        }
    } catch {
        Write-Warning 'Nao foi possivel guardar a sessao do Gran neste usuario do Windows.'
    } finally {
        Remove-Item -LiteralPath $temporaryPath -ErrorAction SilentlyContinue
    }
}

function Test-GranTransientFailure([string]$reason) {
    if ($reason -match '^A busca no Gran falhou \(HTTP (408|500|502|503|504)\)\.$') {
        return $true
    }
    if ($reason -match '^(Falha na consulta .* antes da resposta HTTP|Falha ao ler a resposta do Gran)') {
        return $reason -match 'Tempo limite excedido|\b(UND_ERR_(CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT|SOCKET)|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|EPIPE)\b'
    }
    return $false
}

$inputData = @{
    firstPage = $PaginaInicial
    pageSize = $TamanhoPagina
    maxPages = $MaxPaginas
    pauseSeconds = $PausaSegundos
    allSubjects = [bool]$TodasDisciplinas
}
if ($PSBoundParameters.ContainsKey('ExportarPara')) {
    $inputData.exportDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExportarPara)
}

$session = $null
if ([System.IO.File]::Exists($sessionPath)) {
    try {
        $session = Import-Clixml -LiteralPath $sessionPath
    } catch {
        Write-Warning 'Nao foi possivel carregar a sessao guardada do Gran.'
    }
}
$saveSession = $false
$retryCount = 0
$renewedSession = $false
$retryDelay = [Math]::Max(5, $PausaSegundos)
try {
    if ($session.token -isnot [System.Security.SecureString] -or $session.clientId -isnot [System.Security.SecureString]) {
        $session = [pscustomobject]@{ token = $null; clientId = $null }
        $session.token = Read-Host 'Token da sessao do Gran' -AsSecureString
        $session.clientId = Read-Host 'X-Client-ID' -AsSecureString
        $saveSession = $true
    }

    while ($true) {
        $inputData.token = [System.Net.NetworkCredential]::new('', $session.token).Password
        $inputData.clientId = [System.Net.NetworkCredential]::new('', $session.clientId).Password
        $failure = $null
        # O executavel ja informa o HTTP original e a pagina que pode ser retomada.
        $previousErrorPreference = $ErrorActionPreference
        $previousConsoleEncoding = [Console]::OutputEncoding
        try {
            $ErrorActionPreference = 'Continue'
            $PSNativeCommandUseErrorActionPreference = $false
            [Console]::OutputEncoding = $OutputEncoding
            $inputData | ConvertTo-Json -Compress | & $node $runner 2>&1 | ForEach-Object {
                $line = [string]$_
                if ($line -match '^\S+ \S+ ERRO \S+ P\S*gina (?<page>\d+): (?<reason>.+) Novas gravadas nesta execu\S*: \d+\. Para retomar, use .+$') {
                    $failure = @{ line = $line; page = [int]$Matches.page; reason = $Matches.reason }
                } else {
                    Write-Output $line
                    if ($saveSession -and $line -match '^\S+ \S+ Gran \S+ HTTP 2\d{2} ') {
                        Save-GranSession $session
                        $saveSession = $false
                    }
                }
            }
            $runnerExitCode = $LASTEXITCODE
        } finally {
            [Console]::OutputEncoding = $previousConsoleEncoding
            $ErrorActionPreference = $previousErrorPreference
            $inputData.Remove('token')
            $inputData.Remove('clientId')
        }

        if ($runnerExitCode -eq 0 -or $null -eq $failure) { exit $runnerExitCode }

        $completed = $failure.page - $inputData.firstPage
        if ($completed -gt 0) {
            $retryCount = 0
            $renewedSession = $false
        }
        if ($failure.reason -match '^O Gran recusou a sess\S*o \(HTTP 401\)\.' -and -not $renewedSession) {
            Write-Warning "Sessao do Gran recusada (HTTP 401) na pagina $($failure.page). Atualize o token para continuar."
            $session.token.Dispose()
            $session.token = Read-Host 'Novo token da sessao do Gran' -AsSecureString
            $clientId = Read-Host 'X-Client-ID (Enter para manter o atual)' -AsSecureString
            if ($null -ne $clientId -and $clientId.Length -gt 0) {
                $session.clientId.Dispose()
                $session.clientId = $clientId
            } elseif ($null -ne $clientId) {
                $clientId.Dispose()
            }
            $saveSession = $true
            $renewedSession = $true
        } elseif ($retryCount -lt 2 -and (Test-GranTransientFailure $failure.reason)) {
            $retryCount++
            Write-Warning "Pagina $($failure.page): $($failure.reason) Nova tentativa $retryCount/2 em $retryDelay s."
            Start-Sleep -Seconds $retryDelay
        } else {
            Write-Output $failure.line
            exit $runnerExitCode
        }

        $inputData.firstPage = $failure.page
        if ($inputData.maxPages -gt 0) {
            $inputData.maxPages -= $completed
        }
    }
} finally {
    if ($session.token -is [System.Security.SecureString]) { $session.token.Dispose() }
    if ($session.clientId -is [System.Security.SecureString]) { $session.clientId.Dispose() }
}
