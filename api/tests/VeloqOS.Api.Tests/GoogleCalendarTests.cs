using System.Text.Json;
using VeloqOS.Api.Integrations.Google;

namespace VeloqOS.Api.Tests;

public class GoogleCalendarTests
{
    private const string Events = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    private static readonly CancellationToken Ct = CancellationToken.None;
    private static readonly TimeZoneInfo Stockholm = TimeZoneInfo.FindSystemTimeZoneById("Europe/Stockholm");

    private readonly ManualTimeProvider _time = new(new DateTimeOffset(2026, 10, 30, 9, 0, 0, TimeSpan.Zero));
    private readonly FakeGoogle _google = new();

    private GoogleCalendarProvider Provider()
    {
        var auth = _google.SignedIn(_time);
        return new GoogleCalendarProvider(auth, new GoogleClient(auth, _google), Stockholm);
    }

    [Fact]
    public async Task Reads_the_day_in_local_time_with_timed_and_all_day_events()
    {
        _google.On(HttpMethod.Get, Events, new
        {
            items = new object[]
            {
                new { id = "a", summary = "Planering", location = "Google Meet", start = new { dateTime = "2026-10-30T08:30:00+01:00" }, end = new { dateTime = "2026-10-30T09:00:00+01:00" } },
                new { id = "b", summary = "Ledig", start = new { date = "2026-10-30" }, end = new { date = "2026-10-31" } },
                new { id = "c", status = "cancelled", start = new { dateTime = "2026-10-30T12:00:00+01:00" }, end = new { dateTime = "2026-10-30T13:00:00+01:00" } },
            },
        });

        var events = await Provider().GetEventsAsync(new DateOnly(2026, 10, 30), Ct);

        Assert.Equal(["a", "b"], events.Select(e => e.Id));
        Assert.Equal("Google Meet", events[0].Location);
        Assert.Equal(new DateTimeOffset(2026, 10, 30, 0, 0, 0, TimeSpan.FromHours(1)), events[1].Start);
        Assert.Equal(new DateTimeOffset(2026, 10, 31, 0, 0, 0, TimeSpan.FromHours(1)), events[1].End);
        var url = Uri.UnescapeDataString(_google.Requests.Single().Url);
        Assert.Contains("timeMin=2026-10-30T00:00:00.0000000+01:00", url);
        Assert.Contains("timeMax=2026-10-31T00:00:00.0000000+01:00", url);
        Assert.Contains("singleEvents=true", url);
    }

    [Fact]
    public async Task Creates_an_event_in_the_primary_calendar()
    {
        _google.On(HttpMethod.Post, Events, (_, body) =>
        {
            using var sent = JsonDocument.Parse(body);
            var start = sent.RootElement.GetProperty("start").GetProperty("dateTime").GetString();
            var end = sent.RootElement.GetProperty("end").GetProperty("dateTime").GetString();
            return FakeGoogle.Json(new { id = "new-1", summary = sent.RootElement.GetProperty("summary").GetString(), start = new { dateTime = start }, end = new { dateTime = end } });
        });
        var start = new DateTimeOffset(2026, 10, 30, 13, 0, 0, TimeSpan.FromHours(1));

        var created = await Provider().CreateAsync(new CalendarEvent("", "Fokus", start, start.AddHours(2), null, false), Ct);

        Assert.Equal("new-1", created.Id);
        Assert.Equal("Fokus", created.Title);
        Assert.Equal(start, created.Start);
        Assert.Contains("\"timeZone\":\"Europe/Stockholm\"", _google.BodiesOf(HttpMethod.Post, Events).Single());
    }

    [Fact]
    public async Task Connect_returns_a_sign_in_url_until_signed_in()
    {
        var auth = _google.Auth(_time, out _);
        var provider = new GoogleCalendarProvider(auth, new GoogleClient(auth, _google), Stockholm);

        var url = await provider.ConnectAsync(new OAuthRedirect("http://127.0.0.1:7480/api/google/callback", null), Ct);

        Assert.StartsWith("https://accounts.google.com/", url);
        Assert.Null(await Provider().ConnectAsync(new OAuthRedirect("x", null), Ct));
    }

    [Fact]
    public async Task Moves_an_event_and_returns_null_when_it_is_gone()
    {
        _google.On(HttpMethod.Patch, $"{Events}/a", new
        {
            id = "a", summary = "Planering", start = new { dateTime = "2026-10-30T10:00:00+01:00" }, end = new { dateTime = "2026-10-30T10:30:00+01:00" },
        });
        _google.On(HttpMethod.Patch, $"{Events}/gone", new { error = "not found" }, System.Net.HttpStatusCode.NotFound);
        var start = new DateTimeOffset(2026, 10, 30, 10, 0, 0, TimeSpan.FromHours(1));

        var moved = await Provider().MoveAsync("a", start, start.AddMinutes(30), Ct);

        Assert.Equal(start, moved!.Start);
        var body = JsonDocument.Parse(_google.BodiesOf(HttpMethod.Patch, $"{Events}/a").Single()).RootElement;
        Assert.Equal("2026-10-30T10:00:00.0000000+01:00", body.GetProperty("start").GetProperty("dateTime").GetString());
        Assert.Equal("Europe/Stockholm", body.GetProperty("end").GetProperty("timeZone").GetString());
        Assert.Null(await Provider().MoveAsync("gone", start, start.AddMinutes(30), Ct));
    }
}
