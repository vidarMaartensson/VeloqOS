using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace VeloqOS.Api.Tests;

/// <summary>End-to-end through HTTP with an in-memory server and a hand-moved clock.</summary>
public class ApiTests : IClassFixture<ApiTests.Factory>
{
    public sealed class Factory : WebApplicationFactory<Program>
    {
        public ManualTimeProvider Time { get; } = new(new DateTimeOffset(2026, 10, 29, 13, 0, 0, TimeSpan.Zero));

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("Auth:ApiKey", "");
            builder.ConfigureServices(services => services.Replace(ServiceDescriptor.Singleton<TimeProvider>(Time)));
        }
    }

    private readonly Factory _factory;
    private readonly HttpClient _client;

    public ApiTests(Factory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Health_is_ok()
    {
        var response = await _client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Lists_projects_and_artifacts()
    {
        var projects = await _client.GetFromJsonAsync<List<Project>>("/api/projects");
        var artifacts = await _client.GetFromJsonAsync<List<Artifact>>("/api/artifacts?group=Yagi");

        Assert.Equal(11, projects!.Count);
        Assert.NotEmpty(artifacts!);
        Assert.All(artifacts!, a => Assert.Equal("Yagi", a.Group));
        Assert.All(artifacts!, a => Assert.StartsWith("https://claude.ai/artifact/", a.Url));
    }

    [Fact]
    public async Task Running_a_chore_creates_a_job_that_finishes()
    {
        var response = await _client.PostAsync("/api/chores/memory-cleanup/run", null);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var job = await response.Content.ReadFromJsonAsync<Job>();
        Assert.Equal("running", job!.Status);

        _factory.Time.Advance(TimeSpan.FromMinutes(1));

        var jobs = await _client.GetFromJsonAsync<List<Job>>("/api/jobs");
        Assert.Equal("done", jobs!.Single(j => j.Id == job.Id).Status);
    }

    [Fact]
    public async Task Unknown_chore_is_404()
    {
        var response = await _client.PostAsync("/api/chores/nope/run", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Routine_can_be_turned_off()
    {
        var response = await _client.PutAsJsonAsync("/api/routines/morning-brief", new RoutineUpdate(false));

        var routine = await response.Content.ReadFromJsonAsync<Routine>();
        Assert.False(routine!.Enabled);

        await _client.PutAsJsonAsync("/api/routines/morning-brief", new RoutineUpdate(true));
    }

    [Fact]
    public async Task Inbox_action_and_undo_round_trip()
    {
        var applied = await _client.PostAsJsonAsync("/api/inbox/m4/actions", new InboxActionRequest("task", null));
        Assert.Equal("task", (await applied.Content.ReadFromJsonAsync<InboxItem>())!.HandledWith);

        var undone = await _client.DeleteAsync("/api/inbox/m4/actions");
        Assert.Null((await undone.Content.ReadFromJsonAsync<InboxItem>())!.HandledWith);
    }

    [Fact]
    public async Task Bad_inbox_action_is_400()
    {
        var response = await _client.PostAsJsonAsync("/api/inbox/m1/actions", new InboxActionRequest("explode", null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_inbox_tag_is_400()
    {
        var response = await _client.GetAsync("/api/inbox?tag=Spam");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Calendar_is_empty_until_connected_then_a_suggestion_can_be_booked()
    {
        var before = await _client.GetFromJsonAsync<CalendarDay>("/api/calendar?date=2026-10-29");
        Assert.False(before!.Connected);
        Assert.Empty(before.Events);

        await _client.PostAsync("/api/calendar/connect", null);
        var after = await _client.GetFromJsonAsync<CalendarDay>("/api/calendar?date=2026-10-29");
        Assert.True(after!.Connected);
        var suggestion = Assert.Single(after.Events, e => e.Suggested);

        var booked = await _client.PostAsync($"/api/calendar/suggestions/{suggestion.Id}/book", null);
        Assert.Equal(HttpStatusCode.OK, booked.StatusCode);

        var final = await _client.GetFromJsonAsync<CalendarDay>("/api/calendar?date=2026-10-29");
        Assert.DoesNotContain(final!.Events, e => e.Suggested);
    }

    [Fact]
    public async Task Bad_calendar_date_is_400()
    {
        var response = await _client.GetAsync("/api/calendar?date=29/10");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Prompt_replies_and_rejects_empty_text()
    {
        var ok = await _client.PostAsJsonAsync("/api/prompt", new PromptRequest("Planera HaloDeck", "HaloDeck"));
        var reply = await ok.Content.ReadFromJsonAsync<PromptResponse>();
        Assert.Contains("HaloDeck", reply!.Reply);

        var empty = await _client.PostAsJsonAsync("/api/prompt", new PromptRequest("  ", null));
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
    }
}

public class ApiKeyTests : IClassFixture<ApiKeyTests.Factory>
{
    public sealed class Factory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseSetting("Auth:ApiKey", "hemlig");
    }

    private readonly HttpClient _client;

    public ApiKeyTests(Factory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Health_needs_no_key()
    {
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/api/health")).StatusCode);
    }

    [Fact]
    public async Task Missing_or_wrong_key_is_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.GetAsync("/api/projects")).StatusCode);

        var wrong = new HttpRequestMessage(HttpMethod.Get, "/api/projects");
        wrong.Headers.Add(ApiKeyMiddleware.HeaderName, "fel");
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.SendAsync(wrong)).StatusCode);
    }

    [Fact]
    public async Task Right_key_is_let_through()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/projects");
        request.Headers.Add(ApiKeyMiddleware.HeaderName, "hemlig");

        Assert.Equal(HttpStatusCode.OK, (await _client.SendAsync(request)).StatusCode);
    }
}
