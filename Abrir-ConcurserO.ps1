$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'release\ConcurserO-win32-x64\ConcurserO.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw 'Pacote desktop indisponível. Execute npm.cmd run package na pasta do projeto.'
}
$dataDirectory = $env:CONCURSERO_DATA
if (-not $dataDirectory) { $dataDirectory = Join-Path $PSScriptRoot 'data' }
$dataDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($dataDirectory)
& $exe "--data-dir=$dataDirectory"
