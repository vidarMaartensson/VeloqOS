using System.Diagnostics;

namespace VeloqOS.Api.Integrations.Claude;

public sealed record CommandResult(int ExitCode, string Stdout, string Stderr);

/// <summary>Runs a program to completion. Behind an interface so the agent can be tested without Claude Code.</summary>
public interface ICommandRunner
{
    /// <summary>Throws <see cref="TimeoutException"/> (after killing the process) when <paramref name="timeout"/> passes.</summary>
    Task<CommandResult> RunAsync(
        string file,
        IReadOnlyList<string> arguments,
        string stdin,
        string workingDirectory,
        IReadOnlyDictionary<string, string?> environment,
        TimeSpan timeout,
        CancellationToken cancellationToken);

    /// <summary>Like <see cref="RunAsync"/>, but hands each line of standard output to <paramref name="onLine"/> as it comes.</summary>
    Task<CommandResult> StreamAsync(
        string file,
        IReadOnlyList<string> arguments,
        string stdin,
        string workingDirectory,
        IReadOnlyDictionary<string, string?> environment,
        TimeSpan timeout,
        Func<string, Task> onLine,
        CancellationToken cancellationToken);
}

/// <summary>A program that keeps running: lines in on standard input, lines out on standard output.</summary>
public interface ILiveProcess
{
    /// <summary>Completes when the program has ended.</summary>
    Task Exited { get; }

    /// <summary>The latest of what it wrote to standard error.</summary>
    string Errors { get; }

    Task WriteLineAsync(string line, CancellationToken cancellationToken);

    /// <summary>Null when the program has ended.</summary>
    Task<string?> ReadLineAsync(CancellationToken cancellationToken);

    /// <summary>Closes standard input so it can end by itself, and kills it if it does not.</summary>
    Task StopAsync();
}

/// <summary>Behind an interface so the voice can be tested without Claude Code.</summary>
public interface ILiveProcessStarter
{
    ILiveProcess Start(string file, IReadOnlyList<string> arguments, string workingDirectory, IReadOnlyDictionary<string, string?> environment);
}

public sealed class LiveProcessStarter : ILiveProcessStarter
{
    public ILiveProcess Start(string file, IReadOnlyList<string> arguments, string workingDirectory, IReadOnlyDictionary<string, string?> environment)
    {
        var info = new ProcessStartInfo(file)
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        foreach (var (key, value) in environment)
        {
            if (value is null) info.Environment.Remove(key);
            else info.Environment[key] = value;
        }
        return new LiveProcess(Process.Start(info) ?? throw new InvalidOperationException($"Kunde inte starta {file}."));
    }

    private sealed class LiveProcess : ILiveProcess
    {
        private const int MaxErrors = 2000;
        private static readonly TimeSpan Patience = TimeSpan.FromSeconds(2);

        private readonly Process _process;
        private readonly object _errorsLock = new();
        private string _errors = "";

        public LiveProcess(Process process)
        {
            _process = process;
            _process.StandardInput.AutoFlush = true;
            Exited = _process.WaitForExitAsync();
            _ = ReadErrorsAsync();
        }

        public Task Exited { get; }

        public string Errors
        {
            get { lock (_errorsLock) return _errors; }
        }

        public async Task WriteLineAsync(string line, CancellationToken cancellationToken) =>
            await _process.StandardInput.WriteLineAsync(line.AsMemory(), cancellationToken);

        public async Task<string?> ReadLineAsync(CancellationToken cancellationToken) =>
            await _process.StandardOutput.ReadLineAsync(cancellationToken);

        public async Task StopAsync()
        {
            try
            {
                _process.StandardInput.Close();
                await Exited.WaitAsync(Patience);
            }
            catch (Exception e) when (e is TimeoutException or IOException or InvalidOperationException)
            {
                if (!_process.HasExited) _process.Kill(entireProcessTree: true);
            }
        }

        private async Task ReadErrorsAsync()
        {
            while (await _process.StandardError.ReadLineAsync() is { } line)
            {
                lock (_errorsLock)
                {
                    _errors = $"{_errors}{line}\n";
                    if (_errors.Length > MaxErrors) _errors = _errors[^MaxErrors..];
                }
            }
        }
    }
}

public sealed class ProcessCommandRunner : ICommandRunner
{
    public Task<CommandResult> RunAsync(
        string file,
        IReadOnlyList<string> arguments,
        string stdin,
        string workingDirectory,
        IReadOnlyDictionary<string, string?> environment,
        TimeSpan timeout,
        CancellationToken cancellationToken) =>
        ExecuteAsync(file, arguments, stdin, workingDirectory, environment, timeout, onLine: null, cancellationToken);

    public Task<CommandResult> StreamAsync(
        string file,
        IReadOnlyList<string> arguments,
        string stdin,
        string workingDirectory,
        IReadOnlyDictionary<string, string?> environment,
        TimeSpan timeout,
        Func<string, Task> onLine,
        CancellationToken cancellationToken) =>
        ExecuteAsync(file, arguments, stdin, workingDirectory, environment, timeout, onLine, cancellationToken);

    private static async Task<CommandResult> ExecuteAsync(
        string file,
        IReadOnlyList<string> arguments,
        string stdin,
        string workingDirectory,
        IReadOnlyDictionary<string, string?> environment,
        TimeSpan timeout,
        Func<string, Task>? onLine,
        CancellationToken cancellationToken)
    {
        var info = new ProcessStartInfo(file)
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        foreach (var (key, value) in environment)
        {
            if (value is null) info.Environment.Remove(key);
            else info.Environment[key] = value;
        }

        using var process = Process.Start(info) ?? throw new InvalidOperationException($"Kunde inte starta {file}.");
        using var timer = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timer.CancelAfter(timeout);

        var stdout = onLine is null
            ? process.StandardOutput.ReadToEndAsync(CancellationToken.None)
            : ReadLinesAsync(process.StandardOutput, onLine, timer.Token);
        var stderr = process.StandardError.ReadToEndAsync(CancellationToken.None);
        await process.StandardInput.WriteAsync(stdin);
        process.StandardInput.Close();

        try
        {
            await process.WaitForExitAsync(timer.Token);
            return new CommandResult(process.ExitCode, await stdout, await stderr);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            cancellationToken.ThrowIfCancellationRequested();
            throw new TimeoutException($"{Path.GetFileName(file)} svarade inte inom {timeout.TotalMinutes:0} min.");
        }
    }

    private static async Task<string> ReadLinesAsync(StreamReader reader, Func<string, Task> onLine, CancellationToken cancellationToken)
    {
        var all = new System.Text.StringBuilder();
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            all.AppendLine(line);
            await onLine(line);
        }
        return all.ToString();
    }
}
