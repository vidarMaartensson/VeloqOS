using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Options;
using VeloqOS.Api.Services;
using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Integrations.Voice;

/// <summary>A tool as the Claude API wants it: <c>InputSchema</c> is JSON Schema.</summary>
public sealed record VoiceTool(string Name, string Description, object InputSchema);

/// <summary><c>Content</c> goes back to the model; <c>Action</c> and <c>Confirm</c> go to the dashboard.</summary>
public sealed record ToolOutcome(string Content, VoiceAction Action, VoiceConfirm? Confirm = null);

/// <summary>
/// The voice's hands: each tool calls the same services as the endpoints, so the voice can do what the
/// dashboard can and nothing more. Nothing here deletes files; the disk scan stops at a proposal.
/// </summary>
public sealed class VoiceToolbox(
    JobService jobs,
    InboxService inbox,
    RoutineService routines,
    ProjectCatalog projects,
    ArtifactCatalog artifacts,
    ChoreCatalog chores,
    ICalendarProvider calendar,
    ILinearProvider linear,
    IRepoInspector repos,
    DiskCleaner disk,
    TimeProvider time,
    TimeZoneInfo zone,
    IOptions<VoiceOptions> options)
{
    /// <summary>How long <c>scan_disk</c> waits for the proposal before saying it is still running.</summary>
    public static readonly TimeSpan ScanTimeout = TimeSpan.FromSeconds(45);

    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    public DateTimeOffset LocalNow => TimeZoneInfo.ConvertTime(time.GetUtcNow(), zone);
    public TimeZoneInfo Zone => zone;

    /// <summary>Chores the voice may start: they take no project and no addition.</summary>
    public IReadOnlyList<Chore> Runnable() =>
        chores.List().Where(c => c.Project == ChoreProjects.None && c.Argument is null && c.Id != ChoreCatalog.DiskCleanup).ToList();

    public IReadOnlyList<VoiceTool> Tools()
    {
        var none = new { type = "object", properties = new { } };
        var runnable = Runnable();
        return
        [
            new("get_overview", "Läget just nu: jobb som kör, mejl som behöver Vidar, rutiner, ledigt diskutrymme och dagens möten.", none),
            new("list_events", "Kalendern för en dag.", new
            {
                type = "object",
                properties = new { date = new { type = "string", description = "ÅÅÅÅ-MM-DD. Utelämna för i dag." } },
            }),
            new("create_event", "Lägger in en händelse i Vidars kalender.", new
            {
                type = "object",
                properties = new
                {
                    title = new { type = "string" },
                    start = new { type = "string", description = "ISO 8601 med offset" },
                    end = new { type = "string", description = "ISO 8601 med offset" },
                    location = new { type = "string" },
                },
                required = new[] { "title", "start", "end" },
            }),
            new("list_inbox", "Mejlen som behöver Vidar (inte hanterade, inte brus).", none),
            new("clear_noise", "Arkiverar alla mejl med taggen Brus.", none),
            new("list_issues", "Öppna stories i Linear för ett team.", new
            {
                type = "object",
                properties = new { team = new { type = "string", description = "Teamets nyckel, t.ex. VEL. Utelämna för standardteamet." } },
            }),
            new("create_issue", "Skapar en story i Linear.", new
            {
                type = "object",
                properties = new
                {
                    title = new { type = "string" },
                    description = new { type = "string" },
                    team = new { type = "string", description = "Teamets nyckel, t.ex. VEL. Utelämna för standardteamet." },
                    priority = new { type = "integer", minimum = 0, maximum = 4, description = "0 ingen, 1 brådskande, 2 hög, 3 medel, 4 låg" },
                },
                required = new[] { "title" },
            }),
            new("scan_disk", "Letar upp cache och byggmappar som går att rensa. Rensar inget: förslaget visas för Vidar att godkänna.", none),
            new("run_skill", "Startar en chore eller skill på datorn.", new
            {
                type = "object",
                properties = new { id = new { type = "string", @enum = runnable.Select(c => c.Id).ToArray(), description = string.Join("; ", runnable.Select(c => $"{c.Id}: {c.Name}")) } },
                required = new[] { "id" },
            }),
            new("list_artifacts", "De senast ändrade artefakterna på claude.ai.", none),
            new("project_status", "git, PR:er och CI för projekten med en mapp på datorn.", none),
        ];
    }

    public async Task<ToolOutcome> RunAsync(string name, JsonElement input, CancellationToken ct)
    {
        try
        {
            return name switch
            {
                "get_overview" => await OverviewAsync(ct),
                "list_events" => await EventsAsync(Text(input, "date"), ct),
                "create_event" => await CreateEventAsync(input, ct),
                "list_inbox" => await InboxAsync(ct),
                "clear_noise" => await ClearNoiseAsync(ct),
                "list_issues" => await IssuesAsync(Text(input, "team"), ct),
                "create_issue" => await CreateIssueAsync(input, ct),
                "scan_disk" => await ScanDiskAsync(ct),
                "run_skill" => RunSkill(Text(input, "id")),
                "list_artifacts" => ListArtifacts(),
                "project_status" => await ProjectStatusAsync(ct),
                _ => Failed(name, VoiceTiles.Overview, $"Okänt verktyg: {name}"),
            };
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            return Failed(name, TileOf(name), e.Message);
        }
    }

    private async Task<ToolOutcome> OverviewAsync(CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(LocalNow.DateTime);
        var events = await calendar.GetEventsAsync(today, ct);
        var routineList = routines.List();
        var data = new
        {
            runningJobs = jobs.RunningCount(),
            inboxNeedsYou = await inbox.NeedsYouAsync(ct),
            routinesOn = routineList.Count(r => r.Enabled),
            disk = disk.Disk().Label,
            calendarConnected = calendar.IsConnected,
            meetingsLeftToday = events.Where(e => !e.Suggested && e.End > time.GetUtcNow()).Select(e => new { e.Title, start = Clock(e.Start) }),
        };
        return Ok("get_overview", VoiceTiles.Overview, $"{data.inboxNeedsYou} mejl · {data.disk}", data);
    }

    private async Task<ToolOutcome> EventsAsync(string? date, CancellationToken ct)
    {
        var day = date is not null && DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : DateOnly.FromDateTime(LocalNow.DateTime);
        if (!calendar.IsConnected) return Failed("list_events", VoiceTiles.Calendar, "Kalendern är inte ansluten.");
        var events = await calendar.GetEventsAsync(day, ct);
        return Ok("list_events", VoiceTiles.Calendar, $"{events.Count} händelser {day:yyyy-MM-dd}",
            events.Select(e => new { e.Title, start = Clock(e.Start), end = Clock(e.End), e.Location, e.Suggested }));
    }

    private async Task<ToolOutcome> CreateEventAsync(JsonElement input, CancellationToken ct)
    {
        var title = Text(input, "title");
        if (title is null) return Failed("create_event", VoiceTiles.Calendar, "Händelsen behöver en titel.");
        if (!DateTimeOffset.TryParse(Text(input, "start"), CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) ||
            !DateTimeOffset.TryParse(Text(input, "end"), CultureInfo.InvariantCulture, DateTimeStyles.None, out var end))
            return Failed("create_event", VoiceTiles.Calendar, "Start och slut måste vara ISO 8601-tider.");
        if (end <= start) return Failed("create_event", VoiceTiles.Calendar, "Slutet måste ligga efter starten.");
        if (!calendar.IsConnected) return Failed("create_event", VoiceTiles.Calendar, "Kalendern är inte ansluten.");

        var created = await calendar.CreateAsync(new CalendarEvent("", title, start, end, Text(input, "location"), false), ct);
        var local = TimeZoneInfo.ConvertTime(created.Start, zone);
        return Ok("create_event", VoiceTiles.Calendar, $"Bokade {created.Title} · {local:ddd HH:mm}",
            new { created.Id, created.Title, start = local.ToString("O", CultureInfo.InvariantCulture), end = Clock(created.End) });
    }

    private async Task<ToolOutcome> InboxAsync(CancellationToken ct)
    {
        var items = (await inbox.ListAsync(null, ct)).Where(i => i.HandledWith is null && i.Tag != InboxTags.Noise).ToList();
        return Ok("list_inbox", VoiceTiles.Inbox, $"{items.Count} mejl behöver dig",
            items.Take(8).Select(i => new { i.From, i.Subject, i.Tag, i.Summary }));
    }

    private async Task<ToolOutcome> ClearNoiseAsync(CancellationToken ct)
    {
        var archived = await inbox.ClearNoiseAsync(ct);
        return Ok("clear_noise", VoiceTiles.Inbox, $"Arkiverade {archived} brusmejl", new { archived });
    }

    private async Task<ToolOutcome> IssuesAsync(string? teamKey, CancellationToken ct)
    {
        var team = await TeamAsync(teamKey, ct);
        if (team is null) return Failed("list_issues", VoiceTiles.Linear, teamKey is null ? "Linear har inga team." : $"Hittar inget team {teamKey}.");
        var issues = await linear.IssuesAsync(team.Id, open: true, ct);
        return Ok("list_issues", VoiceTiles.Linear, $"{issues.Count} öppna i {team.Key}",
            issues.Take(10).Select(i => new { i.Identifier, i.Title, state = i.State.Name, priority = i.PriorityLabel }));
    }

    private async Task<ToolOutcome> CreateIssueAsync(JsonElement input, CancellationToken ct)
    {
        var title = Text(input, "title");
        if (title is null) return Failed("create_issue", VoiceTiles.Linear, "Storyn behöver en titel.");
        var teamKey = Text(input, "team");
        var team = await TeamAsync(teamKey, ct);
        if (team is null) return Failed("create_issue", VoiceTiles.Linear, $"Hittar inget team {teamKey}.");
        int? priority = input.TryGetProperty("priority", out var p) && p.ValueKind == JsonValueKind.Number ? Math.Clamp(p.GetInt32(), 0, 4) : null;

        var created = await linear.CreateAsync(new NewLinearIssue(team.Id, title, Text(input, "description"), priority, null), ct);
        return Ok("create_issue", VoiceTiles.Linear, $"Skapade {created.Identifier} · {created.Title}",
            new { created.Identifier, created.Title, state = created.State.Name, created.Url });
    }

    /// <summary>Starts disk-cleanup and waits for its proposal, which the user approves on screen.</summary>
    private async Task<ToolOutcome> ScanDiskAsync(CancellationToken ct)
    {
        var chore = chores.Find(ChoreCatalog.DiskCleanup)!;
        var job = jobs.Start(chore, new ChoreContext(null, projects.CodeHome));
        var finished = await Task.WhenAny(jobs.WhenDone(job.Id), Task.Delay(ScanTimeout, time, ct));
        ct.ThrowIfCancellationRequested();

        var done = jobs.List().First(j => j.Id == job.Id);
        if (done.Status == JobStatus.Running)
            return Ok("scan_disk", VoiceTiles.Disk, "Skannar fortfarande", new { status = "running", jobId = job.Id });
        if (done.Status == JobStatus.Failed)
            return Failed("scan_disk", VoiceTiles.Disk, done.Result ?? "Skanningen misslyckades.");

        var choices = done.Choices ?? [];
        var confirm = choices.Count > 0 ? new VoiceConfirm(done.Id, done.Confirm ?? "Rensa valda", choices) : null;
        var outcome = Ok("scan_disk", VoiceTiles.Disk, choices.Count > 0 ? $"{choices.Count} saker att rensa · väntar på ditt ok" : "Inget att rensa",
            new { result = done.Result, proposals = choices.Select(c => new { c.Label, c.Detail }), waitingForApproval = confirm is not null });
        return outcome with { Confirm = confirm };
    }

    private ToolOutcome RunSkill(string? id)
    {
        var chore = Runnable().FirstOrDefault(c => c.Id == id);
        if (chore is null) return Failed("run_skill", VoiceTiles.Skills, $"Kan inte starta {id} med rösten.");
        var job = jobs.Start(chore, new ChoreContext(null, projects.CodeHome));
        return Ok("run_skill", VoiceTiles.Skills, $"Startade {chore.Name}", new { jobId = job.Id, chore.Name, chore.Estimate });
    }

    private ToolOutcome ListArtifacts()
    {
        var list = artifacts.List().OrderByDescending(a => a.UpdatedAt).Take(8).ToList();
        return Ok("list_artifacts", VoiceTiles.Artifacts, $"{list.Count} senaste artefakterna",
            list.Select(a => new { a.Title, a.Group, updated = a.UpdatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) }));
    }

    private async Task<ToolOutcome> ProjectStatusAsync(CancellationToken ct)
    {
        var statuses = await Task.WhenAll(projects.List().Where(p => p.RepoPath is not null).Select(p => repos.InspectAsync(p, false, ct)));
        var failing = statuses.Count(s => s.Ci == CiStates.Failing);
        return Ok("project_status", VoiceTiles.Projects, failing > 0 ? $"{failing} projekt med rött CI" : $"{statuses.Length} projekt kollade",
            statuses.Select(s => new { s.ProjectId, s.Branch, s.Changes, s.Ahead, s.PullRequests, s.Ci }));
    }

    /// <summary>By key; without one <c>Voice:DefaultTeam</c>, then the first team.</summary>
    private async Task<LinearTeam?> TeamAsync(string? key, CancellationToken ct)
    {
        var teams = await linear.TeamsAsync(ct);
        var wanted = key ?? options.Value.DefaultTeam;
        return wanted is null
            ? teams.FirstOrDefault()
            : teams.FirstOrDefault(t => string.Equals(t.Key, wanted, StringComparison.OrdinalIgnoreCase)) ?? (key is null ? teams.FirstOrDefault() : null);
    }

    private string Clock(DateTimeOffset at) => TimeZoneInfo.ConvertTime(at, zone).ToString("HH:mm", CultureInfo.InvariantCulture);

    private static string? Text(JsonElement input, string name) =>
        input.ValueKind == JsonValueKind.Object && input.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String &&
        !string.IsNullOrWhiteSpace(value.GetString())
            ? value.GetString()!.Trim()
            : null;

    private static ToolOutcome Ok(string tool, string tile, string summary, object data) =>
        new(JsonSerializer.Serialize(data, Json), new VoiceAction(tool, tile, summary, true));

    private static ToolOutcome Failed(string tool, string tile, string error) =>
        new(JsonSerializer.Serialize(new { error }, Json), new VoiceAction(tool, tile, error, false));

    private static string TileOf(string tool) => tool switch
    {
        "list_events" or "create_event" => VoiceTiles.Calendar,
        "list_inbox" or "clear_noise" => VoiceTiles.Inbox,
        "list_issues" or "create_issue" => VoiceTiles.Linear,
        "scan_disk" => VoiceTiles.Disk,
        "run_skill" => VoiceTiles.Skills,
        "list_artifacts" => VoiceTiles.Artifacts,
        "project_status" => VoiceTiles.Projects,
        _ => VoiceTiles.Overview,
    };
}
