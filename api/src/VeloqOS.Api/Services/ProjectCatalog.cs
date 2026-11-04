using VeloqOS.Api.Data;

namespace VeloqOS.Api.Services;

/// <summary>
/// The projects with <see cref="Project.RepoPath"/> filled in from <c>Veloq:ProjectsRoot</c> and
/// <see cref="Project.LinearTeam"/> from the project data or <c>Veloq:LinearTeams:&lt;id&gt;</c>.
/// </summary>
public sealed class ProjectCatalog(IConfiguration configuration)
{
    public string Root { get; } = ExpandHome(configuration["Veloq:ProjectsRoot"] ?? "~/Developer/VeloqLabs");

    /// <summary>Where a free chat in code mode runs. Defaults to the projects root.</summary>
    public string CodeHome => ExpandHome(configuration["Veloq:CodeHome"] ?? Root);

    public IReadOnlyList<Project> List() =>
        SampleData.Projects.Select(p => p with { RepoPath = RepoPathFor(p.Id), LinearTeam = LinearTeamFor(p.Id) }).ToList();

    /// <summary>By id or name, ignoring case – the dashboard sends the name.</summary>
    public Project? Find(string idOrName) => List().FirstOrDefault(p =>
        string.Equals(p.Id, idOrName, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(p.Name, idOrName, StringComparison.OrdinalIgnoreCase));

    /// <summary>An empty <c>Veloq:LinearTeams:&lt;id&gt;</c> unlinks a project that has a team in the project data.</summary>
    private string? LinearTeamFor(string id) =>
        configuration[$"Veloq:LinearTeams:{id}"] is { } key
            ? (string.IsNullOrWhiteSpace(key) ? null : key.Trim())
            : SampleData.LinearTeams.GetValueOrDefault(id);

    private string? RepoPathFor(string id)
    {
        if (!SampleData.RepoFolders.TryGetValue(id, out var folder)) return null;
        var path = Path.Combine(Root, folder);
        return Directory.Exists(path) ? path : null;
    }

    public static string ExpandHome(string path) =>
        path == "~" || path.StartsWith("~/")
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), path.Length > 2 ? path[2..] : "")
            : path;
}
