namespace VeloqOS.Api.Data;

/// <summary>
/// The first version's data. Projects and artifacts are real (Vidar's own), chores and routines
/// are the defaults from the design. Move to a file or SQLite once they need to be editable.
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

    public static readonly IReadOnlyList<Chore> Chores =
    [
        new("memory-cleanup", "Städa minnet", "Slår ihop dubbletter, rensar gamla rader och uppdaterar beskrivningar.", "memory", "≈ 1 min", TimeSpan.FromSeconds(8)),
        new("sync-projects", "Synka projekt", "Läser repon och uppdaterar status och nästa steg för varje projekt.", "sync", "≈ 2 min", TimeSpan.FromSeconds(12)),
        new("claude-md", "Uppdatera CLAUDE.md", "Jämför CLAUDE.md mot koden och föreslår ändringar som du godkänner.", "doc", "≈ 2 min", TimeSpan.FromSeconds(12)),
        new("clear-inbox", "Rensa inkorgen", "Arkiverar brus och lämnar bara det som behöver dig.", "inbox", "≈ 1 min", TimeSpan.FromSeconds(6)),
        new("dependencies", "Kolla beroenden", "Letar efter föråldrade paket och säkerhetsvarningar i alla repon.", "package", "≈ 3 min", TimeSpan.FromSeconds(16)),
        new("week-summary", "Veckosammanfattning", "Skriver ihop veckan i en kort sida du kan läsa på telefonen.", "calendar", "≈ 1 min", TimeSpan.FromSeconds(8)),
    ];

    public static readonly IReadOnlyList<Routine> Routines =
    [
        new("morning-brief", "Morgonbrief", "Vardagar · 07:40", "Kalender, inkorg och projektstatus i en sida innan du börjar.", true),
        new("inbox-review", "Inkorgsgenomgång", "Dagligen · 16:30", "Sorterar Gmail, skriver utkast och flaggar det som behöver dig.", true),
        new("memory-cleanup", "Minnesstädning", "Söndagar · 20:00", "Slår ihop dubbletter och rensar inaktuella rader i minnet.", true),
        new("week-review", "Veckorevy", "Fredagar · 15:00", "Vad som byggts, vad som fastnat och förslag på nästa vecka.", false),
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
