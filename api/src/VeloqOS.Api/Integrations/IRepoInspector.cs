using System.Collections.Concurrent;
using System.Text.Json;
using VeloqOS.Api.Integrations.Claude;

namespace VeloqOS.Api.Integrations;

/// <summary>Reads a project's repo: git on this computer, pull requests and CI through the GitHub CLI.</summary>
public interface IRepoInspector
{
    Task<ProjectStatus> InspectAsync(Project project, bool refresh, CancellationToken cancellationToken);
}

/// <summary>
/// Runs <c>git</c> and <c>gh</c> in the project's folder. <c>gh</c> uses its own login, so no token is stored here;
/// without it (or outside GitHub) pull requests and CI are null. GitHub answers are cached for <see cref="GitHubCache"/>.
/// </summary>
public sealed class RepoInspector(ICommandRunner runner, TimeProvider time, string? gh) : IRepoInspector
{
    public static readonly TimeSpan GitHubCache = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(20);

    private sealed record GitHub(int? PullRequests, string? Ci, string? CiUrl, DateTimeOffset At);

    private readonly ConcurrentDictionary<string, GitHub> _github = new();

    public static string Git => "/usr/bin/git";

    /// <summary>The GitHub CLI where the installers put it, since the Mac app does not get the shell's PATH.</summary>
    public static string? FindGh() => ClaudeOptions.SearchFolders.Select(f => Path.Combine(f, "gh")).FirstOrDefault(File.Exists);

    public async Task<ProjectStatus> InspectAsync(Project project, bool refresh, CancellationToken cancellationToken)
    {
        var path = project.RepoPath ?? throw new ArgumentException($"{project.Name} har ingen mapp.", nameof(project));
        var head = await RunAsync(Git, ["rev-parse", "--abbrev-ref", "HEAD"], path, cancellationToken);
        if (head is null)
            return new ProjectStatus(project.Id, null, 0, null, null, null, null, null, false, "Inget git-repo.");

        var branch = head.Trim();
        var status = await RunAsync(Git, ["status", "--porcelain"], path, cancellationToken) ?? "";
        var changes = status.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length;
        var ahead = int.TryParse(await RunAsync(Git, ["rev-list", "--count", "@{u}..HEAD"], path, cancellationToken), out var a) ? a : (int?)null;
        var log = await RunAsync(Git, ["log", "-1", "--format=%s%x1f%cI"], path, cancellationToken);
        LastCommit? last = log?.Trim().Split('\u001f') is [var message, var at] && DateTimeOffset.TryParse(at, out var when)
            ? new LastCommit(message, when)
            : null;

        var github = await GitHubAsync(path, branch, refresh, cancellationToken);
        return new ProjectStatus(project.Id, branch, changes, ahead, last, github.PullRequests, github.Ci, github.CiUrl,
            github.Ci == CiStates.Failing || changes > 0, null);
    }

    private async Task<GitHub> GitHubAsync(string path, string branch, bool refresh, CancellationToken cancellationToken)
    {
        var key = $"{path}\n{branch}";
        if (!refresh && _github.TryGetValue(key, out var cached) && time.GetUtcNow() - cached.At < GitHubCache) return cached;

        GitHub fresh;
        if (gh is null)
        {
            fresh = new GitHub(null, null, null, time.GetUtcNow());
        }
        else
        {
            var prs = await RunAsync(gh, ["pr", "list", "--state", "open", "--limit", "100", "--json", "number"], path, cancellationToken);
            var runs = await RunAsync(gh, ["run", "list", "--branch", branch, "--limit", "1", "--json", "status,conclusion,url"], path, cancellationToken);
            var (ci, url) = ParseRun(runs);
            fresh = new GitHub(CountPullRequests(prs), ci, url, time.GetUtcNow());
        }
        _github[key] = fresh;
        return fresh;
    }

    public static int? CountPullRequests(string? json)
    {
        if (json is null) return null;
        try
        {
            return JsonDocument.Parse(json).RootElement.GetArrayLength();
        }
        catch (Exception e) when (e is JsonException or InvalidOperationException)
        {
            return null;
        }
    }

    /// <summary>The newest workflow run: still running, green, or anything else that finished (failure, cancelled…) as red.</summary>
    public static (string? Ci, string? Url) ParseRun(string? json)
    {
        if (json is null) return (null, null);
        try
        {
            var runs = JsonDocument.Parse(json).RootElement;
            if (runs.GetArrayLength() == 0) return (null, null);
            var run = runs[0];
            var url = run.TryGetProperty("url", out var u) ? u.GetString() : null;
            var status = run.TryGetProperty("status", out var s) ? s.GetString() : null;
            var conclusion = run.TryGetProperty("conclusion", out var c) ? c.GetString() : null;
            if (status != "completed") return (CiStates.Running, url);
            return (conclusion is "success" or "skipped" or "neutral" ? CiStates.Passing : CiStates.Failing, url);
        }
        catch (Exception e) when (e is JsonException or InvalidOperationException)
        {
            return (null, null);
        }
    }

    /// <returns>Standard output, or null when the command failed or could not start.</returns>
    private async Task<string?> RunAsync(string file, IReadOnlyList<string> args, string path, CancellationToken cancellationToken)
    {
        try
        {
            var result = await runner.RunAsync(file, args, "", path, ClaudeCodeAgent.Environment(), Timeout, cancellationToken);
            return result.ExitCode == 0 ? result.Stdout : null;
        }
        catch (Exception e) when (e is TimeoutException or System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            return null;
        }
    }
}
