using VeloqOS.Api.Integrations.Linear;

namespace VeloqOS.Api.Integrations;

/// <summary>Stories in Linear. <see cref="Linear.LinearProvider"/> with an API key, otherwise <see cref="SampleLinearProvider"/>.</summary>
public interface ILinearProvider
{
    bool Configured { get; }
    /// <summary>One per key, with an error for a workspace that did not answer.</summary>
    Task<IReadOnlyList<LinearWorkspace>> WorkspacesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<LinearTeam>> TeamsAsync(CancellationToken cancellationToken);

    /// <summary>Most recently updated first. <paramref name="open"/> leaves out completed and canceled.</summary>
    Task<IReadOnlyList<LinearIssue>> IssuesAsync(string teamId, bool open, CancellationToken cancellationToken);

    Task<LinearIssue> CreateAsync(NewLinearIssue issue, CancellationToken cancellationToken);

    /// <summary>Moves the story to another state in its team. Null when there is no such story.</summary>
    Task<LinearIssue?> MoveAsync(string issueId, string stateId, CancellationToken cancellationToken);
}

/// <summary>Two workspaces with a few stories in memory, so the views work before a key is set.</summary>
public sealed class SampleLinearProvider(TimeProvider time) : ILinearProvider
{
    private static readonly LinearState[] States =
    [
        new("s-backlog", "Backlog", "backlog", "#bec2c8"),
        new("s-todo", "Todo", "unstarted", "#e2e2e2"),
        new("s-progress", "In Progress", "started", "#f2c94c"),
        new("s-done", "Done", "completed", "#5e6ad2"),
    ];

    private static readonly LinearWorkspace[] Workspaces =
    [
        new("w-veloq", "Veloq Labs", null),
        new("w-jobb", "Jobbet", null),
    ];

    private static readonly LinearTeam[] Teams =
    [
        new("t-halo", "HAL", "Halo", "w-veloq", "Veloq Labs", States),
        new("t-veloq", "VEL", "Veloq", "w-veloq", "Veloq Labs", States),
        new("t-plattform", "PLA", "Plattform", "w-jobb", "Jobbet", States),
    ];

    private readonly List<(string TeamId, LinearIssue Issue)> _issues = [];
    private readonly Lock _lock = new();

    public bool Configured => false;

    public Task<IReadOnlyList<LinearWorkspace>> WorkspacesAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<LinearWorkspace>>(Workspaces);

    public Task<IReadOnlyList<LinearTeam>> TeamsAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<LinearTeam>>(Teams);

    public Task<IReadOnlyList<LinearIssue>> IssuesAsync(string teamId, bool open, CancellationToken cancellationToken)
    {
        if (Teams.All(t => t.Id != teamId)) throw new LinearTeamNotFoundException(teamId);
        lock (_lock)
        {
            Seed();
            IReadOnlyList<LinearIssue> issues = _issues
                .Where(i => i.TeamId == teamId && (!open || i.Issue.State.Type is not ("completed" or "canceled")))
                .Select(i => i.Issue)
                .OrderByDescending(i => i.UpdatedAt)
                .ToList();
            return Task.FromResult(issues);
        }
    }

    public Task<LinearIssue> CreateAsync(NewLinearIssue issue, CancellationToken cancellationToken)
    {
        lock (_lock)
        {
            Seed();
            var team = Teams.FirstOrDefault(t => t.Id == issue.TeamId) ?? throw new LinearTeamNotFoundException(issue.TeamId!);
            var state = States.FirstOrDefault(s => s.Id == issue.StateId) ?? States[1];
            var created = Make(team, _issues.Count(i => i.TeamId == team.Id) + 1, issue.Title!, issue.Description, issue.Priority ?? 0, state, time.GetUtcNow());
            _issues.Add((team.Id, created));
            return Task.FromResult(created);
        }
    }

    public Task<LinearIssue?> MoveAsync(string issueId, string stateId, CancellationToken cancellationToken)
    {
        lock (_lock)
        {
            Seed();
            var index = _issues.FindIndex(i => i.Issue.Id == issueId);
            var state = States.FirstOrDefault(s => s.Id == stateId);
            if (index < 0 || state is null) return Task.FromResult<LinearIssue?>(null);
            var moved = _issues[index].Issue with { State = state, UpdatedAt = time.GetUtcNow() };
            _issues[index] = (_issues[index].TeamId, moved);
            return Task.FromResult<LinearIssue?>(moved);
        }
    }

    private void Seed()
    {
        if (_issues.Count > 0) return;
        var now = time.GetUtcNow();
        (string Team, string Title, int Priority, int State)[] seed =
        [
            ("t-veloq", "Starta om API:t från dashboarden", 2, 2),
            ("t-veloq", "Välj Chatt eller Code i prompten", 3, 1),
            ("t-veloq", "Visa Linear-stories på telefonen", 3, 0),
            ("t-veloq", "Mac-appen som sidecar", 2, 3),
            ("t-halo", "Hjulets fjäder känns för hård", 1, 1),
            ("t-plattform", "Uppgradera till .NET 10", 3, 2),
        ];
        foreach (var (teamId, title, priority, state) in seed)
        {
            var team = Teams.First(t => t.Id == teamId);
            var number = _issues.Count(i => i.TeamId == teamId) + 1;
            _issues.Add((teamId, Make(team, number, title, null, priority, States[state], now.AddHours(-number))));
        }
    }

    private static LinearIssue Make(LinearTeam team, int number, string title, string? description, int priority, LinearState state, DateTimeOffset at) =>
        new($"{team.Key}-{number}", $"{team.Key}-{number}", title, description, priority, LinearPriority.Label(priority),
            $"https://linear.app/exempel/issue/{team.Key}-{number}", state, null, at);
}
