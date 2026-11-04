using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations;
using VeloqOS.Api.Integrations.Claude;

namespace VeloqOS.Api.Services.Chores;

/// <summary>
/// Runs chores and skills through Claude Code in code mode, with <c>Claude:ChorePermissionMode</c>.
/// Chores that propose changes end their reply with a <c>veloq-choices</c> block; approving them resumes the session.
/// Takes every chore, so it is registered last.
/// </summary>
public sealed partial class ClaudeChoreHandler(IAgent agent, IOptions<ClaudeOptions> options) : IChoreHandler
{
    private sealed record Plan(string Prompt, string? Confirm = null, string? ConfirmPrompt = null);

    private const string Swedish = " Svara på svenska, kort och utan emoji.";

    private const string ChoicesInstruction =
        "\n\nAvsluta svaret med ett kodblock av typen veloq-choices med en JSON-lista över det användaren kan välja, till exempel:\n" +
        "```veloq-choices\n[{\"id\": \"web-lodash\", \"label\": \"lodash\", \"detail\": \"web · npm · importeras ingenstans\"}]\n```\n" +
        "Varje id ska vara unikt. Skriv [] om du inte hittade något.";

    private static readonly Dictionary<string, Plan> Plans = new()
    {
        [ChoreCatalog.UnusedPackages] = new(
            "Leta efter beroenden som deklareras men aldrig används i det här repot: npm (package.json), NuGet (.csproj) och Gradle. " +
            "Kontrollera imports och annan användning i koden innan du räknar ett paket som oanvänt. Ändra ingenting än." + Swedish,
            "Ta bort valda",
            "Ta bort de här beroendena och inga andra. Kör sedan bygget och testerna för de delar du rört och berätta hur det gick:"),
        [ChoreCatalog.MemoryCleanup] = new(
            "Städa Claude Codes minne: gå igenom minnesfilerna under ~/.claude/projects/*/memory/. Slå ihop dubbletter, ta bort det som " +
            "inte längre stämmer och se till att varje MEMORY.md bara pekar på filer som finns. Lista vad du ändrade." + Swedish),
        [ChoreCatalog.SyncProjects] = new(
            "Gå igenom git-repona en nivå ner i den här mappen. För varje repo: aktuell branch, ocommittade ändringar, senaste commit " +
            "och ett förslag på nästa steg. Ändra ingenting." + Swedish),
        [ChoreCatalog.ClaudeMd] = new(
            "Jämför CLAUDE.md i det här repot mot koden: kommandon, mappar, sökvägar och regler. Ändra ingenting än. " +
            "Föreslå de ändringar som behövs, en per förslag." + Swedish,
            "Uppdatera CLAUDE.md",
            "Gör de här ändringarna i CLAUDE.md och inget annat. Berätta kort vad du skrev:"),
        [ChoreCatalog.Dependencies] = new(
            "Leta efter föråldrade paket och kända säkerhetsvarningar (till exempel npm outdated och npm audit, " +
            "dotnet list package --outdated --vulnerable och Gradle-beroendenas versioner). Ändra ingenting. Det viktigaste först." + Swedish),
        [ChoreCatalog.WeekSummary] = new(
            "Skriv en kort veckosammanfattning utifrån git-loggarna de senaste sju dagarna i repona en nivå ner i den här mappen: " +
            "vad som byggts, vad som fastnat och förslag på nästa vecka. Ändra ingenting." + Swedish),
    };

    public bool Handles(Chore chore) => true;

    public async Task<ChoreOutcome> RunAsync(Chore chore, ChoreContext context, CancellationToken cancellationToken)
    {
        var plan = PlanFor(chore, context);
        var prompt = plan.Confirm is null ? plan.Prompt : plan.Prompt + ChoicesInstruction;
        var reply = await agent.ReplyAsync(Request(prompt, context, sessionId: null), cancellationToken);
        if (plan.Confirm is null) return new ChoreOutcome(reply.Text.Trim(), SessionId: reply.SessionId);

        var (text, choices) = SplitChoices(reply.Text);
        return new ChoreOutcome(text, choices.Count > 0 ? choices : null, choices.Count > 0 ? plan.Confirm : null, reply.SessionId);
    }

    public async Task<ChoreOutcome> ConfirmAsync(Chore chore, ChoreContext context, ChoreOutcome proposal, IReadOnlyList<JobChoice> picked, CancellationToken cancellationToken)
    {
        var plan = PlanFor(chore, context);
        var list = string.Join('\n', picked.Select(c => $"- {c.Label} ({c.Detail})"));
        var reply = await agent.ReplyAsync(Request($"{plan.ConfirmPrompt}\n{list}", context, proposal.SessionId), cancellationToken);
        return new ChoreOutcome(reply.Text.Trim(), SessionId: reply.SessionId);
    }

    private AgentRequest Request(string text, ChoreContext context, string? sessionId) =>
        new(text, context.Project?.Name, AgentModes.Code, context.WorkingDirectory, sessionId, options.Value.ChorePermissionMode);

    private static Plan PlanFor(Chore chore, ChoreContext context)
    {
        if (SkillReader.SkillName(chore.Id) is { } skill)
            return new Plan(string.IsNullOrWhiteSpace(context.Argument) ? $"/{skill}" : $"/{skill} {context.Argument.Trim()}");
        if (Plans.TryGetValue(chore.Id, out var plan))
            return chore.Id == ChoreCatalog.Dependencies && context.Project is null
                ? plan with { Prompt = "Gå igenom alla git-repon en nivå ner i den här mappen. " + plan.Prompt }
                : plan;
        throw new InvalidOperationException($"Vet inte hur {chore.Name} körs.");
    }

    [GeneratedRegex(@"```veloq-choices\s*(?<json>.*?)```", RegexOptions.Singleline)]
    private static partial Regex ChoicesBlock();

    /// <summary>The reply without its <c>veloq-choices</c> block, and the choices in it. A broken block gives no choices.</summary>
    public static (string Text, IReadOnlyList<JobChoice> Choices) SplitChoices(string reply)
    {
        var match = ChoicesBlock().Match(reply);
        if (!match.Success) return (reply.Trim(), []);

        var text = reply.Remove(match.Index, match.Length).Trim();
        List<JobChoice> choices;
        try
        {
            choices = JsonSerializer.Deserialize<List<JobChoice>>(match.Groups["json"].Value, JsonSerializerOptions.Web) ?? [];
        }
        catch (JsonException)
        {
            return (text, []);
        }

        var valid = choices
            .Where(c => !string.IsNullOrWhiteSpace(c.Id) && !string.IsNullOrWhiteSpace(c.Label))
            .Select(c => c with { Detail = c.Detail ?? "" })
            .DistinctBy(c => c.Id)
            .ToList();
        return (text, valid);
    }
}
