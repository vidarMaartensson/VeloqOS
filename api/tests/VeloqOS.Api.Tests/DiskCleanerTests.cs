using Microsoft.Extensions.Configuration;
using VeloqOS.Api.Services;
using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Tests;

/// <summary>Against a made-up home and projects folder, never the real ones.</summary>
public class DiskCleanerTests : IDisposable
{
    private readonly string _home = Directory.CreateTempSubdirectory("veloq-home").FullName;
    private readonly string _root = Directory.CreateTempSubdirectory("veloq-projects").FullName;
    private readonly DiskCleaner _cleaner;

    public DiskCleanerTests()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Veloq:Home"] = _home, ["Veloq:ProjectsRoot"] = _root })
            .Build();
        _cleaner = new DiskCleaner(configuration, new ProjectCatalog(configuration));
    }

    public void Dispose()
    {
        Directory.Delete(_home, recursive: true);
        Directory.Delete(_root, recursive: true);
    }

    private static void File(string folder, string relative, int bytes)
    {
        var path = Path.Combine(folder, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        System.IO.File.WriteAllBytes(path, new byte[bytes]);
    }

    [Fact]
    public void Finds_caches_with_their_size_largest_first()
    {
        File(_home, ".npm/_cacache/a", 2048);
        File(_home, ".gradle/caches/b/c", 4096);
        Directory.CreateDirectory(Path.Combine(_home, "Library/Caches/pip")); // empty: left out

        var targets = _cleaner.Scan(default);

        Assert.Equal(["gradle", "npm"], targets.Select(t => t.Id));
        Assert.Equal(4096, targets[0].Bytes);
        Assert.Equal("~/.gradle/caches · 4 kB", targets[0].Detail);
    }

    [Fact]
    public void Finds_build_folders_only_next_to_the_file_that_made_them()
    {
        File(_root, "VeloqOS/api/src/Api/Api.csproj", 1);
        File(_root, "VeloqOS/api/src/Api/bin/Debug/a.dll", 1000);
        File(_root, "VeloqOS/api/src/Api/obj/b.json", 1000);
        File(_root, "VeloqOS/web/package.json", 1);
        File(_root, "VeloqOS/web/dist/index.js", 1000);
        File(_root, "VeloqOS/web/node_modules/x/dist/y.js", 5000); // never inside node_modules
        File(_root, "VeloqOS/scripts/bin/start.sh", 5000); // a bin without a .csproj is source

        var target = Assert.Single(_cleaner.Scan(default));

        Assert.Equal("build-VeloqOS", target.Id);
        Assert.Equal("Byggmappar · VeloqOS", target.Label);
        Assert.Equal(3000, target.Bytes);
        Assert.StartsWith("3 mappar · ", target.Detail);
    }

    [Fact]
    public void Cleans_only_the_picked_targets()
    {
        File(_home, ".npm/_cacache/a", 2048);
        File(_home, ".gradle/caches/b", 4096);

        var (freed, failed) = _cleaner.Clean(["npm"], default);

        Assert.Equal(2048, freed);
        Assert.Empty(failed);
        Assert.False(Directory.Exists(Path.Combine(_home, ".npm/_cacache")));
        Assert.True(Directory.Exists(Path.Combine(_home, ".gradle/caches")));
    }

    [Fact]
    public void Nothing_to_clean_is_an_empty_scan()
    {
        Assert.Empty(_cleaner.Scan(default));
        Assert.True(_cleaner.FreeSpace() > 0);
    }

    [Theory]
    [InlineData(512L, "1 kB")]
    [InlineData(5L * 1024 * 1024, "5 MB")]
    [InlineData(15L * 1024 * 1024 * 1024 / 10, "1,5 GB")]
    public void Formats_sizes_the_swedish_way(long bytes, string expected)
    {
        Assert.Equal(expected, DiskCleaner.FormatSize(bytes));
    }
}
