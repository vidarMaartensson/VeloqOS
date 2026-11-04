using VeloqOS.Api.Services;

namespace VeloqOS.Api.Data;

/// <summary>
/// The first version's data. Projects and artifacts are real (Vidar's own), routines are the
/// defaults from the design. Chores live in <see cref="Services.Chores.ChoreCatalog"/>. Move to a file or SQLite once they need to be editable.
/// </summary>
public static class SampleData
{
    public static readonly IReadOnlyList<Project> Projects =
    [
        new("halodeck", "HaloDeck", "Docka · Android", "I utveckling", 3, "Hjul-docka som dras fram från hörnet, nås med tummen.", "Appar"),
        new("veloq-os", "Veloq OS", "React · .NET · Kotlin", "Design", 3, "Den här ytan, plus mobilappen som pratar med datorn.", "Verktyg"),
        new("yagi-sports", "Yagi Sports", "Föreningsapp", "Feb 2027", 3, "Lag, fans, volontärer och styrelse i samma app.", "Appar"),
        new("halo-home", "Halo Home", "Launcher · Android", "Planerad", 2, "Minimal launcher nära stock Android, full kontroll över animationerna.", "Appar"),
        new("halo-type", "Halo Type", "Tangentbord · Android", "Planerad", 2, "Enhandstangentbord byggt på HaloDecks hjulmekanik.", "Appar"),
        new("arcguard", "Arcguard", "Spel · Android", "Planerad", 2, "Litet planetförsvar på samma hjulmekanik.", "Spel"),
        new("devgate", "DevGate", "Verktyg · Android", "Planerad", 2, "Slår av och på Auto Blocker och USB-felsökning beroende på vilken app som är öppen.", "Verktyg"),
        new("innebandy", "Innebandyspel", "Spel · Unity", "Prototyp", 2, "Arkadstraffar mot allt svårare målvakter.", "Spel"),
        new("frontyard", "Frontyard", "Spel · Unity", "Idé", 1, "Överlevnad mot aliens i ditt eget kvarter, genererat från kartdata.", "Spel"),
        new("lightpath", "Lightpath", "Portfolio · .NET + React", "Byggd", 1, "Utforskare för fiberavbrott och deras påverkan.", "Verktyg"),
        new("quizter", "Quizter", "Musikquiz · SwiftUI + Kotlin", "På paus", 1, "Musikquiz mot Spotify, byggt med en vän.", "Appar"),
    ];

    /// <summary>Folder under <c>Veloq:ProjectsRoot</c> for the projects that have a repo.</summary>
    public static readonly IReadOnlyDictionary<string, string> RepoFolders = new Dictionary<string, string>
    {
        ["halodeck"] = "HaloDeck",
        ["veloq-os"] = "VeloqOS",
        ["halo-home"] = "HaloHome",
        ["halo-type"] = "HaloType",
        ["arcguard"] = "Arcguard",
        ["frontyard"] = "FrontYard",
    };

    /// <summary>The Linear team key for the projects that have one. <c>Veloq:LinearTeams:&lt;id&gt;</c> overrides it.</summary>
    public static readonly IReadOnlyDictionary<string, string> LinearTeams = new Dictionary<string, string>
    {
        ["veloq-os"] = "VEL",
        ["halodeck"] = "HAL",
    };

    private static readonly DayOfWeek[] Weekdays = [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday];
    private static readonly DayOfWeek[] EveryDay = Enum.GetValues<DayOfWeek>();

    public static readonly IReadOnlyList<RoutinePlan> Routines =
    [
        new(new("morning-brief", "Morgonbrief", "Vardagar · 07:40", "Kalender, inkorg, stories och projektstatus i en kort text innan du börjar.", true, "morning-brief"), Weekdays, new(7, 40)),
        new(new("artifact-sync", "Synka artefakter", "Dagligen · 07:30", "Hämtar dina artefakter från claude.ai till hyllan.", true, "sync-artifacts"), EveryDay, new(7, 30)),
        new(new("inbox-review", "Inkorgsgenomgång", "Dagligen · 16:30", "Arkiverar brus i inkorgen och lämnar det som behöver dig.", true, "clear-inbox"), EveryDay, new(16, 30)),
        new(new("memory-cleanup", "Minnesstädning", "Söndagar · 20:00", "Slår ihop dubbletter och rensar inaktuella rader i minnet.", true, "memory-cleanup"), [DayOfWeek.Sunday], new(20, 0)),
        new(new("week-review", "Veckorevy", "Fredagar · 15:00", "Vad som byggts, vad som fastnat och förslag på nästa vecka.", false, "week-summary"), [DayOfWeek.Friday], new(15, 0)),
    ];

    public static readonly IReadOnlyList<Artifact> Artifacts =
    [
        A("Fmn4hqXTKLEDfEWsziuqme", "Veloq OS", "screen", "Veloq", "2026-10-29"),
        A("TZjVNZQEWYisfTk68SXyjC", "Veloq Labs", "system", "Veloq", "2026-10-29"),
        A("38izAUh6jMsubv6pAaCYMf", "Systemkarta", "map", "Övrigt", "2026-10-28"),
        A("S1a2vHNU6rUvRoSSRNXkYA", "Riggade dockan, spik", "spike", "Veloq", "2026-10-27"),
        A("GrfqUx6LMAnTwogXehbeM5", "Planetspelet – plan", "plan", "Spel", "2026-10-26"),
        A("HHK6wDoYJ655Guc3jTAWGM", "Yagi Sports app icon", "icon", "Yagi", "2026-10-26"),
        A("3ia6BtfYFMrUUNPDUNo37s", "Yagi Sports logo", "logo", "Yagi", "2026-10-26"),
        A("BUe6Vopz2fmqUyrsAe91WT", "Plan: live-läge för Lightpath", "plan", "Jobb", "2026-10-24"),
        A("Sp3Yqb1SPpTuSQgj278xX6", "Fusklapp – VX Fiber", "doc", "Jobb", "2026-10-22"),
        A("2eCfHuMcgH4CX9NzdNy7xt", "Samverkanslag", "doc", "Övrigt", "2026-10-22"),
        A("WvyYCe84JK48uG5H2eJJV8", "Personligt brev, Umeå kommun", "doc", "Jobb", "2026-10-21"),
        A("J8656ChDb3dWLN6kcYaiGc", "Veloq Labs hemsida", "web", "Veloq", "2026-10-20"),
        A("JssxvQ7QgiLZk1jHR46EjG", "Yagi Sports logga", "logo", "Yagi", "2026-10-19"),
        A("T4kgKTWwgzNQCYZTTyRN6Z", "Halo Home Orbit", "screen", "Veloq", "2026-10-18"),
        A("6JEs7cvL54WHsRxczDQ18G", "Yagi Spelarprofil", "screen", "Yagi", "2026-10-17"),
        A("1DQpzgkxNj7BRAXSq5Yy8s", "Klubbshopen", "screen", "Yagi", "2026-10-15"),
        A("AAm66CBVvpjRoDqustVBxr", "Veloq Phone One", "screen", "Veloq", "2026-10-15"),
        A("HtwieyrEn1RHeaipZ5vwkr", "Veloq Visionskarta", "map", "Veloq", "2026-10-15"),
        A("PCyeB9AEDiPnNAT7tBZS5S", "Yagi Förmåner", "screen", "Yagi", "2026-10-15"),
        A("UdcU22r3MKgTXN9S31QRJE", "Yagi Sponsorer", "screen", "Yagi", "2026-10-14"),
        A("CXttcrkyNwWjUhPR2QgG9A", "Avatar och garderob", "screen", "Övrigt", "2026-10-13"),
        A("4TQusfT6EcXo8iDgExSdUF", "Hall of Fame prototyp", "screen", "Övrigt", "2026-10-12"),
        A("AbuuoZXu8jKY6UTSw7eKAb", "Yagi Sports lanseringskarta", "map", "Yagi", "2026-10-11"),
        A("WBDj4BaRRJL2pYPm1DJjZq", "Veloq Labs logotyp", "logo", "Veloq", "2026-10-09"),
    ];

    private static Artifact A(string id, string title, string kind, string group, string date) =>
        new(id, title, $"https://claude.ai/artifact/{id}", kind, group, DateOnly.ParseExact(date, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture));
}
