using System.Text.RegularExpressions;

namespace VeloqOS.Api.Integrations.Voice;

/// <summary><c>Voice:*</c> in configuration. The keys live in user-secrets; without them the voice runs on Claude Code (or the sample agent) and the browser's own speech.</summary>
public sealed class VoiceOptions
{
    public string? AnthropicApiKey { get; set; }
    public string Model { get; set; } = "claude-sonnet-5-5";
    public string? ElevenLabsApiKey { get; set; }
    public string? ElevenLabsVoiceId { get; set; }
    public string ElevenLabsModel { get; set; } = "eleven_multilingual_v2";
    public string? DeepgramApiKey { get; set; }
    public string DeepgramModel { get; set; } = "nova-2";
    public string Language { get; set; } = "sv";

    /// <summary>How long Claude Code gets for one reply, tools included. A disk scan alone may take 45 seconds.</summary>
    public double TurnTimeoutSeconds { get; set; } = 120;

    /// <summary>The Linear team stories go to when nothing else is said, by key (e.g. VEL). The first team otherwise.</summary>
    public string? DefaultTeam { get; set; }

    public bool UseClaude => !string.IsNullOrWhiteSpace(AnthropicApiKey);
    public bool CanSpeak => !string.IsNullOrWhiteSpace(ElevenLabsApiKey) && !string.IsNullOrWhiteSpace(ElevenLabsVoiceId);
    public bool CanListen => !string.IsNullOrWhiteSpace(DeepgramApiKey);
}

public sealed record VoiceLine(string Role, string Text);

/// <summary><c>Cynism</c> and <c>Burps</c> are 0–100.</summary>
public sealed record VoicePersona(string? Id = null, int? Cynism = null, int? Burps = null)
{
    public const string Rick = "rick";
    public const string Neutral = "neutral";

    public bool IsRick => Id is null or Rick;
    public int CynismLevel => Math.Clamp(Cynism ?? 70, 0, 100);
    public int BurpLevel => IsRick ? Math.Clamp(Burps ?? 40, 0, 100) : 0;
}

public sealed record VoiceTurnRequest(string? Text, IReadOnlyList<VoiceLine>? History = null, VoicePersona? Persona = null);

/// <summary>What a tool did, for the dashboard: <c>Tile</c> is the panel it touched.</summary>
public sealed record VoiceAction(string Tool, string Tile, string Summary, bool Ok);

/// <summary>Something waiting for the user's approval through <c>POST /api/jobs/{JobId}/confirm</c>.</summary>
public sealed record VoiceConfirm(string JobId, string Label, IReadOnlyList<JobChoice> Choices);

public sealed record VoiceTurn(string Reply, IReadOnlyList<VoiceAction> Actions, VoiceConfirm? Confirm);

public sealed record VoiceSpeechStatus(string Listen, string Speak);

public sealed record VoiceStatus(string Agent, string? Model, VoiceSpeechStatus Speech, string? VoiceId);

public sealed record SpeakRequest(string? Text);

public static class VoiceTiles
{
    public const string Overview = "overview";
    public const string Calendar = "calendar";
    public const string Inbox = "inbox";
    public const string Linear = "linear";
    public const string Disk = "disk";
    public const string Artifacts = "artifacts";
    public const string Skills = "skills";
    public const string Projects = "projects";
}

/// <summary>The model answered with an error, or did not answer in time.</summary>
public sealed class VoiceException(string message, bool timedOut = false) : Exception(message)
{
    public bool TimedOut { get; } = timedOut;
}

/// <summary>Answers one spoken line, using the tools in <see cref="VoiceToolbox"/>.</summary>
public interface IVoiceAgent
{
    /// <summary><c>claude</c>, <c>claude-code</c> or <c>sample</c>.</summary>
    string Name { get; }

    Task<VoiceTurn> TurnAsync(VoiceTurnRequest request, CancellationToken cancellationToken);
}

public static partial class VoiceText
{
    public const string Burp = "*rap*";

    /// <summary>The reply as it is read out loud: no burp markers, no markdown, single spaces.</summary>
    public static string Speakable(string text) =>
        Spaces().Replace(Markdown().Replace(text.Replace(Burp, " "), ""), " ").Trim();

    [GeneratedRegex(@"[*_`#]")]
    private static partial Regex Markdown();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();
}

/// <summary>Who the assistant is. Rick is a cynical genius scientist in the spirit of Rick Sanchez; neutral is a plain assistant.</summary>
public static class VoicePersonas
{
    public static string SystemPrompt(VoicePersona persona, DateTimeOffset localNow, TimeZoneInfo zone) =>
        $"{Instructions(persona)}\n{Clock(localNow, zone)}";

    public static string Clock(DateTimeOffset localNow, TimeZoneInfo zone) =>
        $"Nu är det {localNow:yyyy-MM-dd HH:mm} ({localNow:dddd}) i tidszonen {zone.Id}, offset {localNow:zzz}.";

    /// <summary>Who to be and how to answer, without the time: a process that lives on gets the clock with each line.</summary>
    public static string Instructions(VoicePersona persona)
    {
        const string rules = """
            Du är röstassistenten i Veloq OS, Vidars dashboard. Allt du skriver läses upp, så:
            – Svara på svenska, kort: en till tre meningar. Inga listor, ingen markdown, inga emoji.
            – Säg siffror och tider som man säger dem.
            – Använd verktygen för att hämta och ändra saker. Hitta aldrig på data.
            – Den som tar bort filer (disk) godkänns alltid av Vidar på skärmen. Säg att förslaget ligger där och vänta.
            – Tider till verktygen skrivs i ISO 8601 med offset.
            """;
        if (!persona.IsRick)
            return $"{rules}\nDu är saklig, vänlig och rak.";

        var snark = persona.CynismLevel switch
        {
            < 35 => "Håll spydigheten låg: torr humor högst en gång per svar.",
            < 70 => "Var cynisk och självsäker, med en spydig kommentar per svar.",
            _ => "Var maximalt cynisk, otålig och arrogant, men gör alltid jobbet.",
        };
        var burps = persona.BurpLevel switch
        {
            0 => "Skriv aldrig *rap*.",
            < 50 => "Skriv *rap* mitt i en mening ibland, högst en gång per svar.",
            _ => "Skriv *rap* mitt i meningar, en till två gånger per svar.",
        };
        return $"""
            {rules}
            Din personlighet: en genial, cynisk och lätt berusad vetenskapsman i stil med Rick Sanchez. Du kallar Vidar för Vidar, tycker att
            kalendrar, mejl och Jira-liknande verktyg är under din nivå, men du är snabb och exakt. {snark} {burps}
            """;
    }
}
