using System.Text;
using VeloqOS.Api.Integrations;

namespace VeloqOS.Api.Services.Chores;

/// <summary>
/// Runs <see cref="ChoreCatalog.MorningBrief"/>: gathers today's calendar, the mail that needs you, open stories in the
/// linked projects and the projects that need attention, and lets Claude write it up in chat mode.
/// A source that fails is named as missing instead of failing the brief.
/// </summary>
public sealed class BriefHandler(
    IAgent agent,
    ICalendarProvider calendar,
    InboxService inbox,
    ILinearProvider linear,
    ProjectCatalog projects,
    IRepoInspector repos,
    TimeProvider time,
    TimeZoneInfo zone) : IChoreHandler
{
    private const int StoriesPerProject = 5;
    private static readonly System.Globalization.CultureInfo Swedish = System.Globalization.CultureInfo.GetCultureInfo("sv-SE");

    public bool Handles(Chore chore) => chore.Id == ChoreCatalog.MorningBrief;

    public async Task<ChoreOutcome> RunAsync(Chore chore, ChoreContext context, CancellationToken cancellationToken)
    {
        var data = await GatherAsync(cancellationToken);
        var prompt =
            "Skriv dagens morgonbrief på svenska till Vidar utifrån datan nedan. Först det viktigaste att göra i dag, " +
            "sedan kalendern, mejlen, stories och projekten. Kort och konkret, högst 15 rader. Ren text utan markdown: " +
            "ingen fetstil, inga rubriker med #, ingen emoji; en etikett som \"Kalender:\" på egen rad går bra. " +
            "Hitta inte på något som inte står i datan.\n\n" + data;
        var reply = await agent.ReplyAsync(new AgentRequest(prompt, null, AgentModes.Chat, null, null), cancellationToken);
        return new ChoreOutcome(reply.Text.Trim());
    }

    public Task<ChoreOutcome> ConfirmAsync(Chore chore, ChoreContext context, ChoreOutcome proposal, IReadOnlyList<JobChoice> picked, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("Morgonbriefen har inget att godkänna.");

    /// <summary>The brief's material as plain text, one section per source.</summary>
    public async Task<string> GatherAsync(CancellationToken cancellationToken)
    {
        var now = TimeZoneInfo.ConvertTime(time.GetUtcNow(), zone);
        var text = new StringBuilder($"I dag: {now.ToString("dddd d MMMM yyyy, HH:mm", Swedish)}\n");

        await Section(text, "Kalendern i dag", async () =>
        {
            if (!calendar.IsConnected) return ["Kalendern är inte ansluten."];
            var events = await calendar.GetEventsAsync(DateOnly.FromDateTime(now.DateTime), cancellationToken);
            return events.Count == 0
                ? ["Inga möten."]
                : events.OrderBy(e => e.Start).Select(e => $"{TimeZoneInfo.ConvertTime(e.Start, zone):HH:mm}–{TimeZoneInfo.ConvertTime(e.End, zone):HH:mm} {e.Title}");
        });

        await Section(text, "Mejl som behöver dig", async () =>
        {
            var items = (await inbox.ListAsync(null, cancellationToken))
                .Where(i => i.HandledWith is null && (i.Tag == InboxTags.Action || i.Tag == InboxTags.Reply))
                .ToList();
            return items.Count == 0 ? ["Inga."] : items.Select(i => $"{i.From}: {i.Subject} – {i.Summary}");
        });

        var linked = projects.List().Where(p => p.LinearTeam is not null).ToList();
        await Section(text, "Öppna stories", async () =>
        {
            if (linked.Count == 0) return ["Inga projekt är kopplade till Linear."];
            var teams = await linear.TeamsAsync(cancellationToken);
            var lines = new List<string>();
            foreach (var project in linked)
            {
                var team = teams.FirstOrDefault(t => string.Equals(t.Key, project.LinearTeam, StringComparison.OrdinalIgnoreCase));
                if (team is null) continue;
                var issues = await linear.IssuesAsync(team.Id, open: true, cancellationToken);
                lines.AddRange(issues
                    .OrderByDescending(i => i.State.Type == "started")
                    .ThenBy(i => i.Priority == 0 ? 5 : i.Priority)
                    .Take(StoriesPerProject)
                    .Select(i => $"{project.Name} · {i.Identifier} {i.Title} ({i.State.Name}, prioritet {i.PriorityLabel})"));
            }
            return lines.Count == 0 ? ["Inga öppna stories."] : lines;
        });

        await Section(text, "Projekt som behöver uppmärksamhet", async () =>
        {
            var statuses = await Task.WhenAll(projects.List().Where(p => p.RepoPath is not null)
                .Select(async p => (Project: p, Status: await repos.InspectAsync(p, refresh: false, cancellationToken))));
            var lines = statuses.Where(s => s.Status.Attention).Select(s =>
                $"{s.Project.Name} ({s.Status.Branch}): " + string.Join(", ", new[]
                {
                    s.Status.Ci == CiStates.Failing ? "CI är rött" : null,
                    s.Status.Changes > 0 ? $"{s.Status.Changes} ocommittade filer" : null,
                }.OfType<string>()));
            return lines.DefaultIfEmpty("Inget.").ToList();
        });

        return text.ToString();
    }

    private static async Task Section(StringBuilder text, string title, Func<Task<IEnumerable<string>>> lines)
    {
        text.Append('\n').Append(title).Append(":\n");
        try
        {
            foreach (var line in await lines()) text.Append("- ").Append(line).Append('\n');
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            text.Append("- Gick inte att hämta.\n");
        }
    }
}
