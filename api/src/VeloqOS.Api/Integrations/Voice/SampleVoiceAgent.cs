using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VeloqOS.Api.Integrations.Voice;

/// <summary>
/// The voice without an Anthropic key: recognises a handful of commands by keyword and runs the same tools
/// as Claude would, so the dashboard works end to end before a key is set. Deterministic, for the tests.
/// </summary>
public sealed partial class SampleVoiceAgent(VoiceToolbox tools) : IVoiceAgent
{
    public string Name => "sample";

    public async Task<VoiceTurn> TurnAsync(VoiceTurnRequest request, CancellationToken cancellationToken)
    {
        var text = request.Text?.Trim() ?? "";
        var lower = text.ToLower(CultureInfo.GetCultureInfo("sv-SE"));
        var persona = request.Persona ?? new VoicePersona();

        var (tool, input) = Route(lower, text);
        if (tool is null)
            return new VoiceTurn(Say(persona, "Det där förstod jag inte. Be om en rapport, en story, en städad disk eller en tid i kalendern.",
                "Vad? Prata tydligt, Vidar. Jag gör rapporter, stories, disk och kalender, inte tankeläsning."), [], null);

        var outcome = await tools.RunAsync(tool, JsonSerializer.SerializeToElement(input, JsonSerializerOptions.Web), cancellationToken);
        var reply = outcome.Action.Ok ? Reply(tool, outcome, persona) : Say(persona, $"Det gick inte: {outcome.Action.Summary}", $"Nope. {outcome.Action.Summary} Inte mitt fel.");
        return new VoiceTurn(reply, [outcome.Action], outcome.Confirm);
    }

    private (string? Tool, object Input) Route(string lower, string original)
    {
        bool Has(params string[] words) => words.Any(lower.Contains);
        bool Word(params string[] words) => words.Any(w => Regex.IsMatch(lower, $@"\b{w}\b"));

        if (Has("story", "linear", "ärende", "issue"))
            return Has("lägg", "skapa", "ny", "skriv")
                ? ("create_issue", new { title = StoryTitle(original) })
                : ("list_issues", new { });
        if (Has("disk", "städa", "rensa", "cache"))
            return ("scan_disk", new { });
        if (Has("brus"))
            return ("clear_noise", new { });
        if (Has("mejl", "mail", "inkorg"))
            return ("list_inbox", new { });
        if (Has("boka", "fokus") || (Has("kalender") && Has("lägg")))
        {
            var tomorrow = tools.LocalNow.Date.AddDays(1).AddHours(9);
            var start = new DateTimeOffset(tomorrow, tools.Zone.GetUtcOffset(tomorrow));
            return ("create_event", new { title = "Fokus", start = start.ToString("O", CultureInfo.InvariantCulture), end = start.AddHours(2).ToString("O", CultureInfo.InvariantCulture) });
        }
        if (Has("kalender", "möte", "i dag", "idag"))
            return ("list_events", new { });
        if (Has("artefakt"))
            return ("list_artifacts", new { });
        if (Word("ci", "git") || Has("bygg", "projekt"))
            return ("project_status", new { });
        if (Has("rapport", "läget", "översikt", "status", "hur ser"))
            return ("get_overview", new { });
        return (null, new { });
    }

    /// <summary>"Lägg till en story om röstläget" → "Röstläget".</summary>
    private static string StoryTitle(string text)
    {
        var match = About().Match(text);
        var title = match.Success ? match.Groups[1].Value.Trim().TrimEnd('.', '!', '?') : text.Trim();
        return title.Length == 0 ? "Ny story" : char.ToUpper(title[0], CultureInfo.GetCultureInfo("sv-SE")) + title[1..];
    }

    private static string Reply(string tool, ToolOutcome outcome, VoicePersona persona) => tool switch
    {
        "create_issue" => Say(persona, $"Klart. {outcome.Action.Summary}.", $"Klart. {outcome.Action.Summary}. {VoiceText.Burp} Försök hålla den vid liv den här gången."),
        "scan_disk" when outcome.Confirm is not null => Say(persona,
            $"Jag hittade {outcome.Confirm.Choices.Count} saker att rensa. Godkänn på skärmen.",
            $"Din disk ser ut som ett garage efter ett multiversum-krig. {outcome.Confirm.Choices.Count} saker kan bort. Säg ja på skärmen, jag rör inget annars."),
        "scan_disk" => Say(persona, "Det finns inget att rensa just nu.", "Disken är faktiskt ren. Imponerande, för att vara du."),
        "create_event" => Say(persona, $"{outcome.Action.Summary}.", $"{outcome.Action.Summary}. Två timmar utan möten. {VoiceText.Burp} Använd dem."),
        "clear_noise" => Say(persona, $"{outcome.Action.Summary}.", $"{outcome.Action.Summary}. Nyhetsbrev. Människor skickar nyhetsbrev, Vidar."),
        _ => Say(persona, $"{outcome.Action.Summary}.", $"{outcome.Action.Summary}. {VoiceText.Burp} Nästa fråga."),
    };

    /// <summary>The plain line, or Rick's when the persona is Rick and cynical enough. Burps are stripped when they are off.</summary>
    private static string Say(VoicePersona persona, string plain, string rick)
    {
        var line = persona.IsRick && persona.CynismLevel >= 35 ? rick : plain;
        if (persona.BurpLevel == 0) line = line.Replace($"{VoiceText.Burp} ", "").Replace(VoiceText.Burp, "");
        return line.Trim();
    }

    [GeneratedRegex(@"\b(?:om|för|:)\s+(.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex About();
}
