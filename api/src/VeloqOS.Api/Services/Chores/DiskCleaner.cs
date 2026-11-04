using System.Globalization;

namespace VeloqOS.Api.Services.Chores;

/// <summary>
/// Finds caches and build folders that tools recreate on their own, and deletes the ones the user picks.
/// Caches are fixed paths under <c>Veloq:Home</c> (the user's home by default); build folders are looked up
/// in every repo under <c>Veloq:ProjectsRoot</c>, only next to the file that shows which tool made them.
/// </summary>
public sealed class DiskCleaner(IConfiguration configuration, ProjectCatalog projects)
{
    public sealed record Target(string Id, string Label, string Detail, long Bytes, IReadOnlyList<string> Paths);

    private static readonly (string Id, string Label, string Path)[] Caches =
    [
        ("npm", "npm", ".npm/_cacache"),
        ("yarn", "Yarn", "Library/Caches/Yarn"),
        ("pnpm", "pnpm", "Library/pnpm/store"),
        ("gradle", "Gradle", ".gradle/caches"),
        ("derived-data", "Xcode DerivedData", "Library/Developer/Xcode/DerivedData"),
        ("simulator", "Simulatorns cache", "Library/Developer/CoreSimulator/Caches"),
        ("homebrew", "Homebrew", "Library/Caches/Homebrew"),
        ("nuget-http", "NuGet-cache", ".local/share/NuGet/http-cache"),
        ("nuget-packages", "NuGet-paket", ".nuget/packages"),
        ("pip", "pip", "Library/Caches/pip"),
    ];

    /// <summary>A build folder's name and the files, one of which must sit next to it.</summary>
    private static readonly (string Folder, string[] Markers)[] BuildFolders =
    [
        ("bin", ["*.csproj"]),
        ("obj", ["*.csproj"]),
        ("build", ["build.gradle", "build.gradle.kts"]),
        (".gradle", ["settings.gradle", "settings.gradle.kts", "gradlew"]),
        ("target", ["Cargo.toml"]),
        ("dist", ["package.json"]),
    ];

    private static readonly HashSet<string> SkipFolders = [".git", "node_modules"];

    private const int MaxDepth = 5;

    private static readonly EnumerationOptions AllFiles = new()
    {
        RecurseSubdirectories = true,
        IgnoreInaccessible = true,
        AttributesToSkip = FileAttributes.ReparsePoint,
    };

    public string Home => ProjectCatalog.ExpandHome(configuration["Veloq:Home"] ?? "~");

    /// <summary>Everything worth cleaning, largest first. Empty and missing folders are left out.</summary>
    public IReadOnlyList<Target> Scan(CancellationToken cancellationToken)
    {
        var targets = new List<Target>();
        foreach (var (id, label, relative) in Caches)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var path = Path.Combine(Home, relative);
            if (!Directory.Exists(path)) continue;
            var bytes = SizeOf(path);
            if (bytes > 0) targets.Add(new Target(id, label, $"~/{relative} · {FormatSize(bytes)}", bytes, [path]));
        }

        if (Directory.Exists(projects.Root))
        {
            foreach (var repo in Directory.EnumerateDirectories(projects.Root).Order(StringComparer.Ordinal))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var found = new List<string>();
                FindBuildFolders(repo, 0, found);
                var bytes = found.Sum(SizeOf);
                if (bytes == 0) continue;
                var name = Path.GetFileName(repo);
                var folders = found.Count == 1 ? "1 mapp" : $"{found.Count} mappar";
                targets.Add(new Target($"build-{name}", $"Byggmappar · {name}", $"{folders} · {FormatSize(bytes)}", bytes, found));
            }
        }

        return targets.OrderByDescending(t => t.Bytes).ToList();
    }

    /// <summary>Deletes the picked targets, from a fresh scan. Returns what was freed and what could not be deleted.</summary>
    public (long Freed, IReadOnlyList<string> Failed) Clean(IReadOnlyCollection<string> ids, CancellationToken cancellationToken)
    {
        long freed = 0;
        var failed = new List<string>();
        foreach (var target in Scan(cancellationToken).Where(t => ids.Contains(t.Id)))
        {
            cancellationToken.ThrowIfCancellationRequested();
            foreach (var path in target.Paths)
            {
                var bytes = SizeOf(path);
                try
                {
                    Directory.Delete(path, recursive: true);
                    freed += bytes;
                }
                catch (Exception e) when (e is IOException or UnauthorizedAccessException)
                {
                    freed += bytes - SizeOf(path);
                    if (!failed.Contains(target.Label)) failed.Add(target.Label);
                }
            }
        }
        return (freed, failed);
    }

    /// <summary>Free space on the disk that holds <see cref="Home"/>.</summary>
    public long FreeSpace() => Disk().Free;

    /// <summary>The disk that holds <see cref="Home"/>.</summary>
    public DiskInfo Disk()
    {
        var home = Path.GetFullPath(Home);
        var drive = DriveInfo.GetDrives()
            .Where(d => d.IsReady && home.StartsWith(d.RootDirectory.FullName, StringComparison.Ordinal))
            .MaxBy(d => d.RootDirectory.FullName.Length);
        return DiskInfoFor(drive?.AvailableFreeSpace ?? 0, drive?.TotalSize ?? 0);
    }

    /// <summary>Low is under a tenth of the disk or under 10 GB, whichever comes first.</summary>
    public static DiskInfo DiskInfoFor(long free, long total) =>
        new(free, total, $"{FormatSize(free)} ledigt av {FormatSize(total)}", free < total / 10 || free < 10L << 30);

    private static void FindBuildFolders(string folder, int depth, List<string> found)
    {
        if (depth > MaxDepth) return;
        IEnumerable<string> children;
        try
        {
            children = Directory.EnumerateDirectories(folder).ToList();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return;
        }

        foreach (var child in children)
        {
            var name = Path.GetFileName(child);
            if (SkipFolders.Contains(name) || new DirectoryInfo(child).LinkTarget is not null) continue;
            var isBuild = BuildFolders.Any(b => b.Folder == name && b.Markers.Any(m => Directory.EnumerateFiles(folder, m).Any()));
            if (isBuild) found.Add(child);
            else FindBuildFolders(child, depth + 1, found);
        }
    }

    private static long SizeOf(string folder) =>
        Directory.Exists(folder) ? new DirectoryInfo(folder).EnumerateFiles("*", AllFiles).Sum(f => f.Length) : 0;

    private static readonly CultureInfo Swedish = CultureInfo.GetCultureInfo("sv-SE");

    public static string FormatSize(long bytes) => bytes switch
    {
        >= 1L << 30 => string.Create(Swedish, $"{bytes / (double)(1L << 30):0.0} GB"),
        >= 1L << 20 => string.Create(Swedish, $"{bytes / (double)(1L << 20):0} MB"),
        _ => string.Create(Swedish, $"{Math.Max(1, bytes / 1024)} kB"),
    };
}

/// <summary>Runs <see cref="ChoreCatalog.DiskCleanup"/> in the API itself: scan first, delete only what the user approves.</summary>
public sealed class DiskCleanupHandler(DiskCleaner cleaner) : IChoreHandler
{
    public bool Handles(Chore chore) => chore.Id == ChoreCatalog.DiskCleanup;

    public Task<ChoreOutcome> RunAsync(Chore chore, ChoreContext context, CancellationToken cancellationToken) => Task.Run(() =>
    {
        var targets = cleaner.Scan(cancellationToken);
        var free = DiskCleaner.FormatSize(cleaner.FreeSpace());
        if (targets.Count == 0) return new ChoreOutcome($"Inget att rensa. {free} ledigt.");

        var total = DiskCleaner.FormatSize(targets.Sum(t => t.Bytes));
        return new ChoreOutcome(
            $"Hittade {total} att frigöra. {free} ledigt nu.",
            targets.Select(t => new JobChoice(t.Id, t.Label, t.Detail)).ToList(),
            "Rensa valda");
    }, cancellationToken);

    public Task<ChoreOutcome> ConfirmAsync(Chore chore, ChoreContext context, ChoreOutcome proposal, IReadOnlyList<JobChoice> picked, CancellationToken cancellationToken) => Task.Run(() =>
    {
        var (freed, failed) = cleaner.Clean(picked.Select(c => c.Id).ToHashSet(), cancellationToken);
        var result = $"Frigjorde {DiskCleaner.FormatSize(freed)}. {DiskCleaner.FormatSize(cleaner.FreeSpace())} ledigt nu.";
        if (failed.Count > 0) result += $" Kunde inte rensa allt i: {string.Join(", ", failed)}.";
        return new ChoreOutcome(result);
    }, cancellationToken);
}
