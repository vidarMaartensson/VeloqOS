namespace VeloqOS.Api.Services.Chores;

/// <summary>Where a chore runs: the project's folder, or <c>Veloq:CodeHome</c> without a project.</summary>
public sealed record ChoreContext(Project? Project, string WorkingDirectory, string? Argument = null);

/// <summary>
/// What a chore came back with. <c>Choices</c> is a proposal the user approves before anything changes;
/// <c>SessionId</c> lets the approval continue the same Claude Code session.
/// </summary>
public sealed record ChoreOutcome(string Result, IReadOnlyList<JobChoice>? Choices = null, string? Confirm = null, string? SessionId = null);

/// <summary>Carries out chores. A failed run throws; its message becomes the job's result.</summary>
public interface IChoreHandler
{
    bool Handles(Chore chore);

    Task<ChoreOutcome> RunAsync(Chore chore, ChoreContext context, CancellationToken cancellationToken);

    /// <summary>Carries out the choices the user picked from <paramref name="proposal"/>.</summary>
    Task<ChoreOutcome> ConfirmAsync(Chore chore, ChoreContext context, ChoreOutcome proposal, IReadOnlyList<JobChoice> picked, CancellationToken cancellationToken);
}
