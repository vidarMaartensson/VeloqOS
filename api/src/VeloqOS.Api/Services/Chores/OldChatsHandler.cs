using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations.Claude;

namespace VeloqOS.Api.Services.Chores;

/// <summary>
/// Runs <see cref="ChoreCatalog.OldChats"/> by opening the Claude app's scheduled task, where Run now starts it.
/// The task files sessions under a sidebar group, and the sidebar's tools exist only inside the app, not in <c>claude -p</c>.
/// </summary>
public sealed class OldChatsHandler(IOptions<ClaudeOptions> options, ICommandRunner runner) : IChoreHandler
{
    public static string Link(string task) => $"claude://claude.ai/epitaxy/scheduled/{Uri.EscapeDataString(task)}";

    public bool Handles(Chore chore) => chore.Id == ChoreCatalog.OldChats;

    public async Task<ChoreOutcome> RunAsync(Chore chore, ChoreContext context, CancellationToken cancellationToken)
    {
        var result = await runner.RunAsync("/usr/bin/open", [Link(options.Value.OldChatsTask)], "", context.WorkingDirectory,
            new Dictionary<string, string?>(), TimeSpan.FromSeconds(15), cancellationToken);
        if (result.ExitCode != 0)
            throw new InvalidOperationException($"Kunde inte öppna Claude-appen: {(string.IsNullOrWhiteSpace(result.Stderr) ? $"kod {result.ExitCode}" : result.Stderr.Trim())}");
        return new ChoreOutcome("Öppnade jobbet Flytta gamla chattar i Claude-appen. Tryck Kör nu där för att starta det.");
    }

    public Task<ChoreOutcome> ConfirmAsync(Chore chore, ChoreContext context, ChoreOutcome proposal, IReadOnlyList<JobChoice> picked, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("Gamla chattar har inget att godkänna.");
}
