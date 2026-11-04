using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VeloqOS.Api.Services;

namespace VeloqOS.Api.Tests;

/// <summary>End-to-end through HTTP with an in-memory server and a hand-moved clock.</summary>
public class ApiTests : IClassFixture<ApiTests.Factory>
{
    public sealed class Factory : WebApplicationFactory<Program>
    {
        public ManualTimeProvider Time { get; } = new(new DateTimeOffset(2026, 10, 29, 13, 0, 0, TimeSpan.Zero));

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            // "Testing" skips user-secrets, so a developer's real Google client stays out of the tests.
            builder.UseEnvironment("Testing");
            builder.UseSetting("Auth:ApiKey", "");
            builder.UseSetting("Google:ClientId", "");
            builder.UseSetting("Google:TokenPath", Path.Combine(Path.GetTempPath(), $"veloq-test-{Guid.NewGuid()}.json"));
            // Answer with EchoAgent instead of a developer's real Claude Code.
            builder.UseSetting("Claude:Command", "");
            // The keyword voice and the browser's speech, never a developer's real keys.
            builder.UseSetting("Voice:AnthropicApiKey", "");
            builder.UseSetting("Voice:ElevenLabsApiKey", "");
            builder.UseSetting("Voice:DeepgramApiKey", "");
            // Chores never look at the developer's real home, repos or skills.
            builder.UseSetting("Veloq:Home", Path.Combine(Path.GetTempPath(), $"veloq-home-{Guid.NewGuid()}"));
            builder.UseSetting("Veloq:ProjectsRoot", Path.Combine(Path.GetTempPath(), $"veloq-projects-{Guid.NewGuid()}"));
            builder.UseSetting("Claude:SkillsFolder", Path.Combine(Path.GetTempPath(), $"veloq-skills-{Guid.NewGuid()}"));
            builder.UseSetting("Veloq:DataFolder", Path.Combine(Path.GetTempPath(), $"veloq-data-{Guid.NewGuid()}"));
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
        // The chore now really runs (here through EchoAgent), so the test waits for it instead of moving the clock.
        var response = await _client.PostAsync("/api/chores/memory-cleanup/run", null);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var job = await response.Content.ReadFromJsonAsync<Job>();
        Assert.Equal("Städa minnet", job!.Title);

        await _factory.Services.GetRequiredService<JobService>().WhenDone(job.Id);

        var jobs = await _client.GetFromJsonAsync<List<Job>>("/api/jobs");
        var done = jobs!.Single(j => j.Id == job.Id);
        Assert.Equal("done", done.Status);
        Assert.StartsWith("Uppfattat.", done.Result);
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
    public async Task Events_can_be_added_to_the_calendar()
    {
        // Own server: connecting here must not leak into the not-connected-yet calendar test.
        using var factory = new Factory();
        var client = factory.CreateClient();
        await client.PostAsync("/api/calendar/connect", null);
        var start = new DateTimeOffset(2026, 11, 2, 10, 0, 0, TimeSpan.FromHours(1));

        var created = await client.PostAsJsonAsync("/api/calendar/events", new NewCalendarEvent("  Tandläkare ", start, start.AddMinutes(45), "Sveavägen 1"));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var calendarEvent = await created.Content.ReadFromJsonAsync<CalendarEvent>();
        Assert.Equal("Tandläkare", calendarEvent!.Title);
        var day = await client.GetFromJsonAsync<CalendarDay>("/api/calendar?date=2026-11-02");
        Assert.Contains(day!.Events, e => e.Id == calendarEvent.Id && e.Location == "Sveavägen 1");
    }

    [Fact]
    public async Task An_event_needs_a_title_and_must_end_after_it_starts()
    {
        var start = new DateTimeOffset(2026, 11, 2, 10, 0, 0, TimeSpan.FromHours(1));

        var noTitle = await _client.PostAsJsonAsync("/api/calendar/events", new NewCalendarEvent(" ", start, start.AddHours(1), null));
        var backwards = await _client.PostAsJsonAsync("/api/calendar/events", new NewCalendarEvent("Möte", start, start, null));

        Assert.Equal(HttpStatusCode.BadRequest, noTitle.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, backwards.StatusCode);
    }

    [Fact]
    public async Task Undoing_a_sent_reply_is_409()
    {
        await _client.PostAsJsonAsync("/api/inbox/m2/actions", new InboxActionRequest("reply", "Hej!"));

        var undo = await _client.DeleteAsync("/api/inbox/m2/actions");

        Assert.Equal(HttpStatusCode.Conflict, undo.StatusCode);
    }

    [Fact]
    public async Task Google_reports_not_configured_without_a_client()
    {
        var status = await _client.GetFromJsonAsync<GoogleStatus>("/api/google");
        var connect = await _client.PostAsync("/api/google/connect", null);

        Assert.Equal(new GoogleStatus(false, false, null), status);
        Assert.Equal(HttpStatusCode.Conflict, connect.StatusCode);
    }

    [Fact]
    public async Task Google_callback_without_a_code_shows_a_page()
    {
        var page = await _client.GetAsync("/api/google/callback?error=access_denied");

        Assert.Equal("text/html", page.Content.Headers.ContentType!.MediaType);
        Assert.Contains("Inloggningen avbröts.", await page.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Bad_calendar_date_is_400()
    {
        var response = await _client.GetAsync("/api/calendar?date=29/10");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

public class ApiKeyTests : IClassFixture<ApiKeyTests.Factory>
{
    public sealed class Factory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) =>
            builder.UseEnvironment("Testing").UseSetting("Auth:ApiKey", "hemlig").UseSetting("Google:ClientId", "").UseSetting("Claude:Command", "");
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
