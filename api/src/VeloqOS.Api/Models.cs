namespace VeloqOS.Api;

/// <summary>A project shown as an orb. Tier 3 = active, 2 = planned, 1 = dormant.</summary>
public sealed record Project(string Id, string Name, string Meta, string Status, int Tier, string Body, string Group);

public sealed record Chore(string Id, string Name, string Description, string Icon, string Estimate, TimeSpan Duration);

public sealed record Job(
    string Id,
    string ChoreId,
    string Title,
    string Step,
    double Progress,
    string Status,
    DateTimeOffset StartedAt,
    string? Result);

public sealed record Routine(string Id, string Name, string Schedule, string Description, bool Enabled);

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

public sealed record Artifact(string Id, string Title, string Url, string Kind, string Group, DateOnly UpdatedAt);

public sealed record PromptRequest(string Text, string? Context);

public sealed record PromptResponse(string Reply);

public sealed record Overview(
    int Projects,
    int ActiveProjects,
    int RunningJobs,
    int InboxNeedsYou,
    int RoutinesOn,
    int RoutinesTotal,
    int Artifacts);
