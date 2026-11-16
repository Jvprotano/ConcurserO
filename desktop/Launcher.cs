using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class Launcher
{
    [STAThread]
    private static int Main()
    {
        using (var sessionLock = new Mutex(false, @"Local\ConcurserO-Launcher"))
        {
            try
            {
                if (!sessionLock.WaitOne(0)) return 0;
            }
            catch (AbandonedMutexException)
            {
                // The previous launcher exited without releasing the mutex.
            }

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                StartSession();
                return 0;
            }
            catch (Exception error)
            {
                MessageBox.Show("Não foi possível abrir o ConcurserO.\n\n" + error.Message,
                    "ConcurserO", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally
            {
                sessionLock.ReleaseMutex();
            }
        }
    }

    private static void StartSession()
    {
        string desktopDirectory = AppDomain.CurrentDomain.BaseDirectory;
        string script = Path.Combine(desktopDirectory, "Start-ConcurserOSession.ps1");
        var startInfo = new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe"),
            Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"",
            WorkingDirectory = Path.GetDirectoryName(Path.GetDirectoryName(script)),
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        var errors = new StringBuilder();
        using (var icon = new Icon(Path.Combine(desktopDirectory, "ConcurserO.ico"), 64, 64))
        using (var mark = icon.ToBitmap())
        using (var splash = CreateSplash(icon, mark))
        using (var worker = new Process { StartInfo = startInfo })
        using (var windowOpened = new ManualResetEvent(false))
        using (var timer = new System.Windows.Forms.Timer { Interval = 50 })
        {
            worker.OutputDataReceived += (sender, args) =>
            {
                if (args.Data == "ConcurserO:WindowOpened") windowOpened.Set();
            };
            worker.ErrorDataReceived += (sender, args) =>
            {
                if (!string.IsNullOrWhiteSpace(args.Data)) errors.AppendLine(args.Data);
            };
            timer.Tick += (sender, args) =>
            {
                if (windowOpened.WaitOne(0) || worker.HasExited) splash.Close();
            };
            splash.Show();
            splash.Update();
            worker.Start();
            worker.BeginOutputReadLine();
            worker.BeginErrorReadLine();
            timer.Start();
            Application.Run(splash);
            timer.Stop();

            // Hold the mutex until the worker has shut down its local server.
            worker.WaitForExit();
            if (worker.ExitCode != 0)
            {
                string detail = errors.ToString().Trim();
                throw new InvalidOperationException(
                    detail.Length > 0 ? detail : "O processo de inicialização foi interrompido.");
            }
        }
    }

    private static Form CreateSplash(Icon icon, Image mark)
    {
        var splash = new Form
        {
            Text = "ConcurserO",
            StartPosition = FormStartPosition.CenterScreen,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            ControlBox = false,
            AutoScaleMode = AutoScaleMode.Font,
            Font = SystemFonts.MessageBoxFont,
            ClientSize = new Size(364, 143),
            BackColor = ColorTranslator.FromHtml("#142e27"),
            Icon = icon
        };
        var picture = new PictureBox
        {
            Bounds = new Rectangle(24, 23, 64, 64),
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = mark
        };
        var title = new Label
        {
            AutoSize = true,
            Location = new Point(101, 25),
            Font = new Font("Segoe UI Semibold", 17),
            ForeColor = ColorTranslator.FromHtml("#fffefa"),
            Text = "ConcurserO"
        };
        var status = new Label
        {
            AutoSize = true,
            Location = new Point(103, 61),
            ForeColor = ColorTranslator.FromHtml("#d1e0d2"),
            Text = "Preparando sua área de estudo…"
        };
        var progress = new ProgressBar
        {
            Bounds = new Rectangle(26, 106, 312, 9),
            AccessibleName = "Carregando",
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 25
        };
        splash.Controls.AddRange(new Control[] { picture, title, status, progress });
        return splash;
    }
}
