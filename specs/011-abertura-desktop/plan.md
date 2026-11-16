# Plano

- R1. Criar uma marca gráfica com a paleta verde do app e um motivo de estudo. Converter para ICO com várias resoluções, manter os assets no projeto e aplicar ao atalho existente.
- R2, R3. Fazer o atalho apontar para um lançador WinForms compilado com o .NET Framework do Windows. Pintar a janela de progresso antes de iniciar o PowerShell oculto. O processo de preparação sinaliza pela saída padrão quando a janela principal aparece. O lançador mantém o bloqueio de instância até o processo terminar.
- R4. Reaproveitar o servidor dedicado, o perfil separado, o diretório de dados e o encerramento pelo pipe de entrada.
- C1–C4. Inspecionar o atalho e observar o fluxo normal, cliques repetidos, falha por porta ocupada e encerramento, usando uma cópia isolada para os dados de teste.

## Compilar o lançador no Windows

Depois de instalar as dependências do app, execute na raiz do projeto:

```powershell
& "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe" /nologo /target:winexe /optimize+ /out:desktop\ConcurserO.exe /win32icon:desktop\ConcurserO.ico /r:System.Windows.Forms.dll /r:System.Drawing.dll desktop\Launcher.cs
.\Abrir-ConcurserO.ps1
```

O lançador abre uma janela dedicada no Chrome ou Edge. Fechar essa janela encerra o servidor da sessão.
