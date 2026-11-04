using System.Text.Json;
using VeloqOS.Api.Data;

namespace VeloqOS.Api.Services;

/// <summary>
/// The artifact shelf: the last sync from claude.ai, saved as <c>artifacts.json</c> under <c>Veloq:DataFolder</c>,
/// or the sample list before the first sync.
/// </summary>
public sealed class ArtifactCatalog(IConfiguration configuration)
{
    public static readonly IReadOnlySet<string> Kinds = new HashSet<string> { "doc", "plan", "map", "screen", "web", "logo", "system", "spike", "icon" };
    public static readonly IReadOnlySet<string> Groups = new HashSet<string> { "Veloq", "Yagi", "Jobb", "Spel", "Övrigt" };

    private readonly Lock _gate = new();

    public string DataFolder => ProjectCatalog.ExpandHome(configuration["Veloq:DataFolder"] ?? Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VeloqOS"));

    private string FilePath => Path.Combine(DataFolder, "artifacts.json");

    public IReadOnlyList<Artifact> List()
    {
        lock (_gate)
        {
            if (!File.Exists(FilePath)) return SampleData.Artifacts;
            try
            {
                return JsonSerializer.Deserialize<List<Artifact>>(File.ReadAllText(FilePath), JsonSerializerOptions.Web) ?? [];
            }
            catch (JsonException)
            {
                return SampleData.Artifacts;
            }
        }
    }

    public void Save(IReadOnlyList<Artifact> artifacts)
    {
        lock (_gate)
        {
            Directory.CreateDirectory(DataFolder);
            var temp = FilePath + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(artifacts, JsonSerializerOptions.Web));
            File.Move(temp, FilePath, overwrite: true);
        }
    }
}
