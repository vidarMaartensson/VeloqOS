namespace VeloqOS.Api;

/// <summary>
/// A project shown as an orb. Tier 3 = active, 2 = planned, 1 = dormant. <c>RepoPath</c> is set when the folder exists;
/// <c>LinearTeam</c> is the key of the project's team in Linear.
/// </summary>
public sealed record Project(string Id, string Name, string Meta, string Status, int Tier, string Body, string Group, string? RepoPath = null, string? LinearTeam = null);

public sealed record LastCommit(string Message, DateTimeOffset At);

/// <summary>A repo's state on this computer and on GitHub. See docs/api.md for each field.</summary>
public sealed record ProjectStatus(
    string ProjectId,
    string? Branch,
    int Changes,
    int? Ahead,
    LastCommit? LastCommit,
    int? PullRequests,
    string? Ci,
    string? CiUrl,
    bool Attention,
    string? Error);

public static class CiStates
{
    public const string Passing = "passing";
    public const string Failing = "failing";
    public const string Running = "running";
}

public sealed record DiskInfo(long Free, long Total, string Label, bool Low);

public sealed record SystemInfo(DiskInfo Disk);

public sealed record Brief(string Text, DateTimeOffset CreatedAt, string JobId);

/// <summary>
/// Something the computer can do on request: a built-in chore or one of the user's Claude Code skills.
/// <c>Duration</c> is the usual run time, used to estimate progress.
/// </summary>
public sealed record Chore(
    string Id,
    string Name,
    string Description,
    string Icon,
    string Estimate,
    TimeSpan Duration,
    string Kind = ChoreKinds.Chore,
    string Project = ChoreProjects.None,
    string? Argument = null);

public static class ChoreKinds
{
    public const string Chore = "chore";
    public const string Skill = "skill";
}

/// <summary>Whether a chore runs in a project's folder.</summary>
public static class ChoreProjects
{
    public const string None = "none";
    public const string Optional = "optional";
    public const string Required = "required";
}

public sealed record ChoreRunRequest(string? ProjectId = null, string? Argument = null);

/// <summary>Something a finished job proposes, for the user to approve.</summary>
public sealed record JobChoice(string Id, string Label, string Detail);

public sealed record JobConfirmRequest(IReadOnlyList<string>? Choices);

public sealed record Job(
    string Id,
    string ChoreId,
    string Title,
    string? Project,
    string Step,
    double Progress,
    string Status,
    DateTimeOffset StartedAt,
    string? Result,
    IReadOnlyList<JobChoice>? Choices = null,
    string? Confirm = null,
    DateTimeOffset? FinishedAt = null);

public sealed record Routine(
    string Id,
    string Name,
    string Schedule,
    string Description,
    bool Enabled,
    string ChoreId,
    DateTimeOffset? NextRunAt = null,
    DateTimeOffset? LastRunAt = null);

public sealed record RoutineUpdate(bool Enabled);

public static class InboxTags
{
    public const string Action = "Åtgärd";
    public const string Reply = "Svar";
    public const string Info = "Info";
    public const string Noise = "Brus";

    public static readonly IReadOnlySet<string> All = new HashSet<string> { Action, Reply, Info, Noise };
}

public static class InboxActions
{
    public const string Reply = "reply";
    public const string Delegate = "delegate";
    public const string Archive = "archive";
    public const string Task = "task";
    public const string Snooze = "snooze";
    public const string Calendar = "calendar";

    public static readonly IReadOnlySet<string> All = new HashSet<string> { Reply, Delegate, Archive, Task, Snooze, Calendar };
}

public sealed record InboxItem(
    string Id,
    string From,
    DateTimeOffset ReceivedAt,
    string Subject,
    string Tag,
    string Summary,
    string SuggestedAction,
    string Suggestion,
    string? Draft,
    string? HandledWith);

public sealed record InboxActionRequest(string Action, string? Body);

public sealed record CalendarEvent(
    string Id,
    string Title,
    DateTimeOffset Start,
    DateTimeOffset End,
    string? Location,
    bool Suggested);

public sealed record CalendarDay(bool Connected, DateOnly Date, IReadOnlyList<CalendarEvent> Events);

public sealed record CalendarConnectResult(bool Connected, string? AuthUrl);

public sealed record NewCalendarEvent(string? Title, DateTimeOffset Start, DateTimeOffset End, string? Location);

public sealed record CalendarMove(DateTimeOffset Start, DateTimeOffset End);

public sealed record GoogleStatus(bool Configured, bool Connected, string? Email);

public sealed record GoogleConnectResult(string AuthUrl);

/// <summary>One per API key. <c>Error</c> is set when that workspace did not answer; the others still work.</summary>
public sealed record LinearWorkspace(string Id, string Name, string? Error);

public sealed record LinearStatus(bool Configured, IReadOnlyList<LinearWorkspace> Workspaces);

public sealed record LinearState(string Id, string Name, string Type, string Color);

public sealed record LinearTeam(string Id, string Key, string Name, string WorkspaceId, string Workspace, IReadOnlyList<LinearState> States);

public sealed record LinearIssue(
    string Id,
    string Identifier,
    string Title,
    string? Description,
    int Priority,
    string PriorityLabel,
    string Url,
    LinearState State,
    string? Assignee,
    DateTimeOffset UpdatedAt);

public sealed record NewLinearIssue(string? TeamId, string? Title, string? Description, int? Priority, string? StateId);

public sealed record LinearIssueUpdate(string? StateId);

public static class LinearPriority
{
    /// <summary>Linear's 0–4 scale with Swedish labels: 0 none, 1 urgent … 4 low.</summary>
    public static readonly IReadOnlyList<string> Labels = ["Ingen", "Brådskande", "Hög", "Medel", "Låg"];

    public static string Label(int priority) => priority >= 0 && priority < Labels.Count ? Labels[priority] : Labels[0];
}

public sealed record Artifact(string Id, string Title, string Url, string Kind, string Group, DateOnly UpdatedAt);

public sealed record Overview(
    int Projects,
    int ActiveProjects,
    int RunningJobs,
    int InboxNeedsYou,
    int RoutinesOn,
    int RoutinesTotal,
    int Artifacts);
