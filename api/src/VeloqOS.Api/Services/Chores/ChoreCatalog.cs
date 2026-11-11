using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations.Claude;

namespace VeloqOS.Api.Services.Chores;

/// <summary>The built-in chores followed by the user's Claude Code skills, read fresh on every call.</summary>
public sealed class ChoreCatalog(IOptions<ClaudeOptions> claude)
{
    public const string DiskCleanup = "disk-cleanup";
    public const string UnusedPackages = "unused-packages";
    public const string MemoryCleanup = "memory-cleanup";
    public const string SyncProjects = "sync-projects";
    public const string ClaudeMd = "claude-md";
    public const string ClearInbox = "clear-inbox";
    public const string Dependencies = "dependencies";
    public const string WeekSummary = "week-summary";
    public const string MorningBrief = "morning-brief";
    public const string SyncArtifacts = "sync-artifacts";
    public const string OldChats = "old-chats";

    public static readonly IReadOnlyList<Chore> Builtin =
    [
        new(DiskCleanup, "Rensa cache", "Letar upp cache och byggmappar som går att ta bort och visar hur mycket du kan frigöra. Inget rensas förrän du godkänt.", "disk", "≈ 1 min", TimeSpan.FromSeconds(40)),
        new(UnusedPackages, "Oanvända paket", "Letar efter beroenden som aldrig används i projektet. Du väljer vilka som ska bort, sedan körs testerna.", "package", "≈ 3 min", TimeSpan.FromMinutes(3), Project: ChoreProjects.Required),
        new(MemoryCleanup, "Städa minnet", "Slår ihop dubbletter, rensar gamla rader och uppdaterar beskrivningar.", "memory", "≈ 1 min", TimeSpan.FromMinutes(1)),
        new(SyncProjects, "Synka projekt", "Läser repona och skriver status och nästa steg för varje projekt.", "sync", "≈ 2 min", TimeSpan.FromMinutes(2)),
        new(ClaudeMd, "Uppdatera CLAUDE.md", "Jämför CLAUDE.md mot koden och föreslår ändringar som du godkänner.", "doc", "≈ 2 min", TimeSpan.FromMinutes(2), Project: ChoreProjects.Required),
        new(ClearInbox, "Rensa inkorgen", "Arkiverar brus och lämnar bara det som behöver dig.", "inbox", "≈ 1 min", TimeSpan.FromSeconds(10)),
        new(Dependencies, "Kolla beroenden", "Letar efter föråldrade paket och säkerhetsvarningar, i ett projekt eller alla repon.", "package", "≈ 3 min", TimeSpan.FromMinutes(3), Project: ChoreProjects.Optional),
        new(MorningBrief, "Morgonbrief", "Kalender, inkorg, stories och projektstatus i en kort text.", "calendar", "≈ 1 min", TimeSpan.FromMinutes(1)),
        new(SyncArtifacts, "Synka artefakter", "Hämtar dina artefakter från claude.ai till hyllan.", "sync", "≈ 1 min", TimeSpan.FromMinutes(1)),
        new(OldChats, "Gamla chattar", "Öppnar jobbet i Claude-appen som flyttar Code-sessioner som inte rörts på en vecka till gruppen gamla-chattar.", "sync", "≈ 1 min", TimeSpan.FromSeconds(5)),
        new(WeekSummary, "Veckosammanfattning", "Skriver ihop veckan utifrån git-loggarna i en kort text du kan läsa på telefonen.", "calendar", "≈ 2 min", TimeSpan.FromMinutes(2)),
    ];

    public IReadOnlyList<Chore> List() => [.. Builtin, .. SkillReader.Read(claude.Value.ResolvedSkillsFolder)];

    public Chore? Find(string id) => List().FirstOrDefault(c => c.Id == id);
}
