using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations.Voice;

namespace VeloqOS.Api.Tests;

/// <summary>The voice endpoints with the keyword agent, and the moves the dashboard makes by dragging.</summary>
public class VoiceApiTests(ApiTests.Factory factory) : IClassFixture<ApiTests.Factory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private async Task<VoiceTurn> Say(string text, VoicePersona? persona = null)
    {
        var response = await _client.PostAsJsonAsync("/api/voice/turn", new VoiceTurnRequest(text, null, persona));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<VoiceTurn>())!;
    }

    [Fact]
    public async Task Without_keys_the_voice_is_the_sample_with_browser_speech()
    {
        var status = await _client.GetFromJsonAsync<VoiceStatus>("/api/voice");

        Assert.Equal(new VoiceStatus("sample", null, new VoiceSpeechStatus("browser", "browser"), null), status);
    }

    [Fact]
    public async Task An_empty_line_is_refused()
    {
        var response = await _client.PostAsJsonAsync("/api/voice/turn", new { text = "  " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Creates_a_story_in_the_default_team_and_points_at_the_linear_tile()
    {
        var turn = await Say("Lägg till en story om röstläget i dashboarden");

        var action = Assert.Single(turn.Actions);
        Assert.Equal(("create_issue", "linear", true), (action.Tool, action.Tile, action.Ok));
        Assert.StartsWith("Skapade VEL-", action.Summary);
        Assert.Contains("Röstläget i dashboarden", action.Summary);
        Assert.Contains(VoiceText.Burp, turn.Reply);
    }

    [Fact]
    public async Task The_neutral_persona_never_burps_or_snarks()
    {
        var turn = await Say("Lägg till en story om tester", new VoicePersona(VoicePersona.Neutral, 100, 100));

        Assert.DoesNotContain(VoiceText.Burp, turn.Reply);
        Assert.StartsWith("Klart. Skapade VEL-", turn.Reply);
        Assert.EndsWith("Tester.", turn.Reply);
    }

    [Fact]
    public async Task Books_focus_time_tomorrow_once_the_calendar_is_connected()
    {
        var before = await Say("Boka fokustid i morgon");
        Assert.False(Assert.Single(before.Actions).Ok);

        await _client.PostAsync("/api/calendar/connect", null);
        var turn = await Say("Boka fokustid i morgon");

        var action = Assert.Single(turn.Actions);
        Assert.Equal(("create_event", "calendar", true), (action.Tool, action.Tile, action.Ok));
        // The test clock stands at 2026-10-29 14:00 in Stockholm.
        var day = await _client.GetFromJsonAsync<CalendarDay>("/api/calendar?date=2026-10-30");
        Assert.Contains(day!.Events, e => e.Title == "Fokus" && e.Start == new DateTimeOffset(2026, 10, 30, 9, 0, 0, TimeSpan.FromHours(1)));
    }

    [Fact]
    public async Task A_disk_scan_stops_at_a_proposal_and_deletes_nothing()
    {
        var turn = await Say("Städa min disk");

        var action = Assert.Single(turn.Actions);
        Assert.Equal(("scan_disk", "disk", true), (action.Tool, action.Tile, action.Ok));
        // The test home is empty, so there is nothing to approve.
        Assert.Null(turn.Confirm);
        Assert.Contains((await _client.GetFromJsonAsync<List<Job>>("/api/jobs"))!, j => j.ChoreId == "disk-cleanup" && j.Status == "done");
    }

    [Fact]
    public async Task Something_it_does_not_know_runs_no_tool()
    {
        var turn = await Say("Sjung en sång");

        Assert.Empty(turn.Actions);
        Assert.Null(turn.Confirm);
    }

    [Fact]
    public async Task Speech_needs_its_keys()
    {
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PostAsJsonAsync("/api/voice/speak", new { text = "Hej" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.PostAsJsonAsync("/api/voice/speak", new { text = "*rap*" })).StatusCode);
        var audio = new ByteArrayContent([1, 2, 3]);
        audio.Headers.ContentType = new("audio/webm");
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PostAsync("/api/voice/transcribe", audio)).StatusCode);
    }

    [Fact]
    public async Task Moves_a_calendar_event_but_not_a_suggestion()
    {
        await _client.PostAsync("/api/calendar/connect", null);
        var start = new DateTimeOffset(2026, 10, 31, 10, 0, 0, TimeSpan.FromHours(1));

        var moved = await _client.PatchAsJsonAsync("/api/calendar/events/20261031-e1", new CalendarMove(start, start.AddMinutes(30)));
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        var day = await _client.GetFromJsonAsync<CalendarDay>("/api/calendar?date=2026-10-31");
        Assert.Equal(start, day!.Events.Single(e => e.Id == "20261031-e1").Start);

        var again = await _client.PatchAsJsonAsync("/api/calendar/events/20261031-e1", new CalendarMove(start.AddDays(1), start.AddDays(1).AddHours(1)));
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Contains((await _client.GetFromJsonAsync<CalendarDay>("/api/calendar?date=2026-11-01"))!.Events, e => e.Id == "20261031-e1");

        Assert.Equal(HttpStatusCode.NotFound, (await _client.PatchAsJsonAsync("/api/calendar/events/20261031-s1", new CalendarMove(start, start.AddHours(1)))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.PatchAsJsonAsync("/api/calendar/events/nope", new CalendarMove(start, start.AddHours(1)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.PatchAsJsonAsync("/api/calendar/events/20261031-e2", new CalendarMove(start, start))).StatusCode);
    }

    [Fact]
    public async Task Moves_a_story_to_another_column()
    {
        var teams = await _client.GetFromJsonAsync<List<LinearTeam>>("/api/linear/teams");
        var veloq = teams!.Single(t => t.Key == "VEL");
        var story = (await _client.GetFromJsonAsync<List<LinearIssue>>($"/api/linear/issues?teamId={veloq.Id}"))!.First();

        var response = await _client.PatchAsJsonAsync($"/api/linear/issues/{story.Id}", new LinearIssueUpdate("s-done"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("completed", (await response.Content.ReadFromJsonAsync<LinearIssue>())!.State.Type);
        Assert.DoesNotContain((await _client.GetFromJsonAsync<List<LinearIssue>>($"/api/linear/issues?teamId={veloq.Id}"))!, i => i.Id == story.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.PatchAsJsonAsync("/api/linear/issues/NOPE-1", new LinearIssueUpdate("s-done"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.PatchAsJsonAsync($"/api/linear/issues/{story.Id}", new LinearIssueUpdate(null))).StatusCode);
    }
}

/// <summary>The Claude agent's tool loop and the speech services, against fake HTTP.</summary>
public class ClaudeVoiceAgentTests(ApiTests.Factory factory) : IClassFixture<ApiTests.Factory>
{
    private readonly FakeGoogle _http = new();
    private readonly List<JsonElement> _bodies = [];

    private ClaudeVoiceAgent Agent(params object[] answers)
    {
        var queue = new Queue<object>(answers);
        _http.On(HttpMethod.Post, ClaudeVoiceAgent.Endpoint, (request, body) =>
        {
            Assert.Equal("sk-test", request.Headers.GetValues("x-api-key").Single());
            _bodies.Add(JsonDocument.Parse(body).RootElement.Clone());
            var answer = queue.Dequeue();
            return answer is HttpResponseMessage response ? response : FakeGoogle.Json(answer);
        });
        var options = Options.Create(new VoiceOptions { AnthropicApiKey = "sk-test", Model = "claude-test", DefaultTeam = "VEL" });
        var tools = ActivatorUtilities.CreateInstance<VoiceToolbox>(factory.Services, options);
        return new ClaudeVoiceAgent(tools, _http, options);
    }

    private static object Text(string text) => new { stop_reason = "end_turn", content = new[] { new { type = "text", text } } };

    [Fact]
    public async Task Runs_the_tools_Claude_asks_for_and_returns_its_last_words()
    {
        var agent = Agent(
            new
            {
                stop_reason = "tool_use",
                content = new object[]
                {
                    new { type = "text", text = "Ett ögonblick." },
                    new { type = "tool_use", id = "tu_1", name = "create_issue", input = new { title = "Portalen", priority = 2 } },
                },
            },
            Text("Klart, *rap* den ligger i backloggen."));

        var turn = await agent.TurnAsync(new VoiceTurnRequest("Ny story om portalen", [new VoiceLine("assistant", "Hej."), new VoiceLine("user", "Hallå")], new VoicePersona("rick", 80, 60)), default);

        Assert.Equal("Klart, *rap* den ligger i backloggen.", turn.Reply);
        var action = Assert.Single(turn.Actions);
        Assert.Equal(("create_issue", "linear", true), (action.Tool, action.Tile, action.Ok));

        var first = _bodies[0];
        Assert.Equal("claude-test", first.GetProperty("model").GetString());
        Assert.Contains("Rick Sanchez", first.GetProperty("system").GetString());
        Assert.Contains(first.GetProperty("tools").EnumerateArray(), t => t.GetProperty("name").GetString() == "scan_disk");
        // The greeting from the assistant cannot come first, and the two user lines are merged.
        var messages = first.GetProperty("messages");
        Assert.Equal(1, messages.GetArrayLength());
        Assert.Equal("Hallå\nNy story om portalen", messages[0].GetProperty("content").GetString());

        var result = _bodies[1].GetProperty("messages")[2].GetProperty("content")[0];
        Assert.Equal(("tool_result", "tu_1", false), (result.GetProperty("type").GetString(), result.GetProperty("tool_use_id").GetString(), result.GetProperty("is_error").GetBoolean()));
        Assert.Contains("Portalen", result.GetProperty("content").GetString());
    }

    [Fact]
    public async Task A_failing_tool_goes_back_to_Claude_as_an_error()
    {
        var agent = Agent(
            new { stop_reason = "tool_use", content = new object[] { new { type = "tool_use", id = "tu_1", name = "create_issue", input = new { title = "X", team = "NOPE" } } } },
            Text("Det teamet finns inte."));

        var turn = await agent.TurnAsync(new VoiceTurnRequest("Story i NOPE"), default);

        Assert.False(Assert.Single(turn.Actions).Ok);
        Assert.True(_bodies[1].GetProperty("messages")[2].GetProperty("content")[0].GetProperty("is_error").GetBoolean());
    }

    [Fact]
    public async Task An_error_from_Claude_becomes_a_voice_exception()
    {
        var agent = Agent(FakeGoogle.Json(new { type = "error", error = new { type = "overloaded_error", message = "Overloaded" } }, (HttpStatusCode)529));

        var e = await Assert.ThrowsAsync<VoiceException>(() => agent.TurnAsync(new VoiceTurnRequest("Hej"), default));

        Assert.Equal("Claude svarade 529: Overloaded", e.Message);
    }

    [Fact]
    public void The_neutral_prompt_has_no_rick_and_burps_follow_the_slider()
    {
        var now = new DateTimeOffset(2026, 10, 29, 14, 0, 0, TimeSpan.FromHours(1));
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Stockholm");

        Assert.DoesNotContain("Rick", VoicePersonas.SystemPrompt(new VoicePersona("neutral"), now, zone));
        Assert.Contains("Skriv aldrig *rap*", VoicePersonas.SystemPrompt(new VoicePersona("rick", 50, 0), now, zone));
        Assert.Contains("2026-10-29 14:00", VoicePersonas.SystemPrompt(new VoicePersona(), now, zone));
    }

    [Fact]
    public async Task Speaks_through_elevenlabs_without_burps_and_transcribes_through_deepgram()
    {
        _http.On(HttpMethod.Post, $"{SpeechProvider.ElevenLabs}/voice-1", (_, _) => new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([9, 9]) });
        _http.On(HttpMethod.Post, SpeechProvider.Deepgram, new { results = new { channels = new[] { new { alternatives = new[] { new { transcript = "städa disken" } } } } } });
        var speech = new SpeechProvider(_http, Options.Create(new VoiceOptions { ElevenLabsApiKey = "el", ElevenLabsVoiceId = "voice-1", DeepgramApiKey = "dg" }));

        Assert.Equal([9, 9], await speech.SpeakAsync("Klart. *rap* **Nästa**.", default));
        var spoken = JsonDocument.Parse(_http.BodiesOf(HttpMethod.Post, SpeechProvider.ElevenLabs).Single()).RootElement;
        Assert.Equal("Klart. Nästa.", spoken.GetProperty("text").GetString());

        Assert.Equal("städa disken", await speech.TranscribeAsync(new MemoryStream(Encoding.UTF8.GetBytes("ljud")), "audio/webm", default));
        Assert.Contains("language=sv", _http.Requests[^1].Url);
    }
}
