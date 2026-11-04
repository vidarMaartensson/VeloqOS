using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using VeloqOS.Api.Services;

namespace VeloqOS.Api.Tests;

/// <summary>Chores and skills over HTTP, with a made-up home, projects folder and skills folder, answered by EchoAgent.</summary>
public class ChoreTests : IDisposable
{
    private sealed record ChoreDto(string Id, string Name, string Kind, string Project, string? Argument);

    private readonly string _temp = Directory.CreateTempSubdirectory("veloq-chores").FullName;
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    private string Home => Path.Combine(_temp, "home");
    private string Root => Path.Combine(_temp, "projects");

    public ChoreTests()
    {
        Directory.CreateDirectory(Path.Combine(Root, "HaloDeck"));
        Directory.CreateDirectory(Path.Combine(_temp, "skills", "pr"));
        File.WriteAllText(Path.Combine(_temp, "skills", "pr", "SKILL.md"), "---\nname: pr\ndescription: Committa och pusha.\n---\n");

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder
            .UseEnvironment("Testing")
            .UseSetting("Auth:ApiKey", "")
            .UseSetting("Google:ClientId", "")
            .UseSetting("Google:TokenPath", Path.Combine(_temp, "token.json"))
            .UseSetting("Claude:Command", "")
            .UseSetting("Claude:SkillsFolder", Path.Combine(_temp, "skills"))
            .UseSetting("Veloq:Home", Home)
            .UseSetting("Veloq:DataFolder", Path.Combine(_temp, "data"))
            .UseSetting("Veloq:ProjectsRoot", Root)
            .UseSetting("Veloq:CodeHome", Path.Combine(_temp, "fritt")));
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _factory.Dispose();
        Directory.Delete(_temp, recursive: true);
    }

    private async Task<Job> Finished(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var job = (await response.Content.ReadFromJsonAsync<Job>())!;
        await _factory.Services.GetRequiredService<JobService>().WhenDone(job.Id);
        var jobs = await _client.GetFromJsonAsync<List<Job>>("/api/jobs");
        return jobs!.Single(j => j.Id == job.Id);
    }

    [Fact]
    public async Task Lists_built_in_chores_then_skills()
    {
        var chores = await _client.GetFromJsonAsync<List<ChoreDto>>("/api/chores");

        Assert.Equal("disk-cleanup", chores![0].Id);
        Assert.Contains(chores, c => c is { Id: "unused-packages", Kind: "chore", Project: "required", Argument: null });
        var skill = chores[^1];
        Assert.Equal(new ChoreDto("skill-pr", "/pr", "skill", "optional", "Tillägg (valfritt)"), skill);
    }

    [Fact]
    public async Task A_skill_runs_in_the_picked_project()
    {
        var job = await Finished(await _client.PostAsJsonAsync("/api/chores/skill-pr/run", new { projectId = "halodeck", argument = "Ny titel" }));

        Assert.Equal("done", job.Status);
        Assert.Equal("HaloDeck", job.Project);
        Assert.Equal("/pr", job.Title);
        Assert.Contains("HaloDeck", job.Result); // EchoAgent names the project it got
    }

    [Fact]
    public async Task An_empty_body_runs_a_chore_without_project()
    {
        var job = await Finished(await _client.PostAsync("/api/chores/sync-projects/run", null));

        Assert.Equal("done", job.Status);
        Assert.Null(job.Project);
    }

    [Theory]
    [InlineData("unused-packages", null)] // needs a project
    [InlineData("disk-cleanup", "halodeck")] // takes none
    [InlineData("unused-packages", "finns-inte")]
    [InlineData("unused-packages", "arcguard")] // no folder on this computer
    public async Task Rejects_a_missing_or_wrong_project(string chore, string? projectId)
    {
        var response = await _client.PostAsJsonAsync($"/api/chores/{chore}/run", new { projectId });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Disk_cleanup_proposes_and_cleans_only_what_was_picked()
    {
        Directory.CreateDirectory(Path.Combine(Home, ".npm", "_cacache"));
        File.WriteAllBytes(Path.Combine(Home, ".npm", "_cacache", "a"), new byte[2048]);
        Directory.CreateDirectory(Path.Combine(Home, ".gradle", "caches"));
        File.WriteAllBytes(Path.Combine(Home, ".gradle", "caches", "b"), new byte[4096]);

        var scan = await Finished(await _client.PostAsync("/api/chores/disk-cleanup/run", null));

        Assert.Equal("done", scan.Status);
        Assert.StartsWith("Hittade 6 kB att frigöra.", scan.Result);
        Assert.Equal(["gradle", "npm"], scan.Choices!.Select(c => c.Id));
        Assert.Equal("Rensa valda", scan.Confirm);

        var cleaned = await Finished(await _client.PostAsJsonAsync($"/api/jobs/{scan.Id}/confirm", new { choices = new[] { "gradle" } }));

        Assert.Equal("done", cleaned.Status);
        Assert.StartsWith("Frigjorde 4 kB.", cleaned.Result);
        Assert.False(Directory.Exists(Path.Combine(Home, ".gradle", "caches")));
        Assert.True(File.Exists(Path.Combine(Home, ".npm", "_cacache", "a")));

        var again = await _client.PostAsJsonAsync($"/api/jobs/{scan.Id}/confirm", new { choices = new[] { "npm" } });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Confirm_rejects_unknown_jobs_and_choices()
    {
        Assert.Equal(HttpStatusCode.NotFound,
            (await _client.PostAsJsonAsync("/api/jobs/nope/confirm", new { choices = new[] { "npm" } })).StatusCode);

        Directory.CreateDirectory(Path.Combine(Home, ".npm", "_cacache"));
        File.WriteAllBytes(Path.Combine(Home, ".npm", "_cacache", "a"), new byte[2048]);
        var scan = await Finished(await _client.PostAsync("/api/chores/disk-cleanup/run", null));

        Assert.Equal(HttpStatusCode.BadRequest,
            (await _client.PostAsJsonAsync($"/api/jobs/{scan.Id}/confirm", new { choices = Array.Empty<string>() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await _client.PostAsJsonAsync($"/api/jobs/{scan.Id}/confirm", new { choices = new[] { "gradle" } })).StatusCode);
    }

    [Fact]
    public async Task Clearing_the_inbox_runs_in_the_api()
    {
        var job = await Finished(await _client.PostAsync("/api/chores/clear-inbox/run", null));

        Assert.Equal("done", job.Status);
        Assert.Matches("^(Arkiverade \\d+ mejl|Inget brus)", job.Result);
    }
}
