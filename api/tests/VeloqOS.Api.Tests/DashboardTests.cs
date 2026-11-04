using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VeloqOS.Api.Integrations;
using VeloqOS.Api.Services;
using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Tests;

/// <summary>System, project status, stories, routines, the brief and streaming, over HTTP with EchoAgent and sample Linear.</summary>
public class DashboardTests : IDisposable
{
    private sealed class FakeRepos : IRepoInspector
    {
        public Task<ProjectStatus> InspectAsync(Project project, bool refresh, CancellationToken cancellationToken) =>
            Task.FromResult(new ProjectStatus(project.Id, "main", 3, 0, null, 1, CiStates.Failing, "https://ci", true, null));
    }

    private readonly string _temp = Directory.CreateTempSubdirectory("veloq-dashboard").FullName;
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public DashboardTests()
    {
        var root = Path.Combine(_temp, "projects");
        Directory.CreateDirectory(Path.Combine(root, "VeloqOS"));
        Directory.CreateDirectory(Path.Combine(root, "HaloHome"));

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder
            .UseEnvironment("Testing")
            .UseSetting("Auth:ApiKey", "")
            .UseSetting("Google:ClientId", "")
            .UseSetting("Google:TokenPath", Path.Combine(_temp, "token.json"))
            .UseSetting("Claude:Command", "")
            .UseSetting("Claude:SkillsFolder", Path.Combine(_temp, "skills"))
            .UseSetting("Veloq:Home", Path.Combine(_temp, "home"))
            .UseSetting("Veloq:DataFolder", Path.Combine(_temp, "data"))
            .UseSetting("Veloq:ProjectsRoot", root)
            .UseSetting("Veloq:LinearTeams:halodeck", "NOPE")
            .ConfigureServices(services => services.Replace(ServiceDescriptor.Singleton<IRepoInspector>(new FakeRepos()))));
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
        return (await _client.GetFromJsonAsync<List<Job>>("/api/jobs"))!.Single(j => j.Id == job.Id);
    }

    [Fact]
    public async Task Reports_the_disk()
    {
        var system = await _client.GetFromJsonAsync<SystemInfo>("/api/system");

        Assert.True(system!.Disk.Total > 0);
        Assert.Contains(" ledigt av ", system.Disk.Label);
    }

    [Theory]
    [InlineData(5L << 30, 500L << 30, true)] // under 10 GB
    [InlineData(40L << 30, 500L << 30, true)] // under a tenth
    [InlineData(60L << 30, 500L << 30, false)]
    public void Low_disk_is_under_a_tenth_or_ten_gigabytes(long free, long total, bool low)
    {
        Assert.Equal(low, DiskCleaner.DiskInfoFor(free, total).Low);
    }

    [Fact]
    public async Task Projects_carry_their_linear_team_and_the_status_covers_those_with_a_folder()
    {
        var projects = await _client.GetFromJsonAsync<List<Project>>("/api/projects");
        Assert.Equal("VEL", projects!.Single(p => p.Id == "veloq-os").LinearTeam);
        Assert.Null(projects!.Single(p => p.Id == "halo-home").LinearTeam);

        var status = await _client.GetFromJsonAsync<List<ProjectStatus>>("/api/projects/status");
        Assert.Equal(["veloq-os", "halo-home"], status!.Select(s => s.ProjectId));
        Assert.All(status!, s => Assert.True(s.Attention));
    }

    [Fact]
    public async Task Lists_a_projects_open_stories()
    {
        var stories = await _client.GetFromJsonAsync<List<LinearIssue>>("/api/projects/veloq-os/stories");

        Assert.NotEmpty(stories!);
        Assert.All(stories!, s => Assert.StartsWith("VEL-", s.Identifier));
        Assert.All(stories!, s => Assert.NotEqual("completed", s.State.Type));
    }

    [Theory]
    [InlineData("finns-inte", HttpStatusCode.NotFound)]
    [InlineData("halo-home", HttpStatusCode.BadRequest)] // no team
    [InlineData("halodeck", HttpStatusCode.NotFound)] // its team key is in no workspace
    public async Task Stories_need_a_project_with_a_team_that_exists(string id, HttpStatusCode expected)
    {
        Assert.Equal(expected, (await _client.GetAsync($"/api/projects/{id}/stories")).StatusCode);
    }

    [Fact]
    public async Task Routines_have_a_schedule_and_can_run_now()
    {
        var routines = await _client.GetFromJsonAsync<List<Routine>>("/api/routines");
        Assert.Equal(5, routines!.Count);
        Assert.All(routines.Where(r => r.Enabled), r => Assert.NotNull(r.NextRunAt));

        var job = await Finished(await _client.PostAsync("/api/routines/week-review/run", null));
        Assert.Equal("week-summary", job.ChoreId);
        Assert.NotNull(job.FinishedAt);
        Assert.NotNull((await _client.GetFromJsonAsync<List<Routine>>("/api/routines"))!.Single(r => r.Id == "week-review").LastRunAt);

        Assert.Equal(HttpStatusCode.NotFound, (await _client.PostAsync("/api/routines/nope/run", null)).StatusCode);
    }

    [Fact]
    public async Task The_brief_is_the_latest_morning_brief()
    {
        Assert.Equal(HttpStatusCode.NoContent, (await _client.GetAsync("/api/brief")).StatusCode);

        var job = await Finished(await _client.PostAsync("/api/routines/morning-brief/run", null));

        var brief = await _client.GetFromJsonAsync<Brief>("/api/brief");
        Assert.Equal(job.Id, brief!.JobId);
        Assert.Equal(job.Result, brief.Text);
    }

    [Fact]
    public async Task The_brief_gathers_every_source_and_names_what_is_missing()
    {
        var handler = _factory.Services.GetServices<IChoreHandler>().OfType<BriefHandler>().Single();

        var data = await handler.GatherAsync(default);

        Assert.Contains("Kalendern är inte ansluten.", data);
        Assert.Contains("Mejl som behöver dig:", data);
        Assert.Contains("Veloq OS · VEL-", data);
        Assert.Contains("Veloq OS (main): CI är rött, 3 ocommittade filer", data);
    }
}
