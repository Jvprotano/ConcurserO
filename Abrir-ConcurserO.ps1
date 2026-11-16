$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'desktop\ConcurserO.exe')
exit $LASTEXITCODE
