using System.Globalization;
using System.Text.Json;

namespace VeloqOS.Api.Integrations.Google;

/// <summary>The primary Google Calendar. Shares its sign-in with Gmail through <see cref="GoogleAuth"/>.</summary>
public sealed class GoogleCalendarProvider(GoogleAuth auth, GoogleClient google, TimeZoneInfo zone) : ICalendarProvider
{
    private const string Events = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    public bool IsConnected => auth.IsConnected;

    public Task<string?> ConnectAsync(OAuthRedirect redirect, CancellationToken cancellationToken) =>
        Task.FromResult(auth.IsConnected ? null : auth.Start(redirect));

    public async Task<IReadOnlyList<CalendarEvent>> GetEventsAsync(DateOnly date, CancellationToken cancellationToken)
    {
        if (!auth.IsConnected) return [];

        var from = StartOf(date);
        var to = StartOf(date.AddDays(1));
        var url = $"{Events}?singleEvents=true&orderBy=startTime&maxResults=100" +
                  $"&timeMin={Uri.EscapeDataString(from.ToString("O", CultureInfo.InvariantCulture))}" +
                  $"&timeMax={Uri.EscapeDataString(to.ToString("O", CultureInfo.InvariantCulture))}";

        var json = await google.GetAsync(url, cancellationToken);
        if (!json.TryGetProperty("items", out var items)) return [];
        return items.EnumerateArray()
            .Where(e => e.TryGetProperty("status", out var s) ? s.GetString() != "cancelled" : true)
            .Select(Parse)
            .ToList();
    }

    public async Task<CalendarEvent> CreateAsync(CalendarEvent calendarEvent, CancellationToken cancellationToken)
    {
        var body = new
        {
            summary = calendarEvent.Title,
            location = calendarEvent.Location,
            start = new { dateTime = calendarEvent.Start.ToString("O", CultureInfo.InvariantCulture), timeZone = zone.Id },
            end = new { dateTime = calendarEvent.End.ToString("O", CultureInfo.InvariantCulture), timeZone = zone.Id },
        };
        return Parse(await google.PostAsync(Events, body, cancellationToken));
    }

    public async Task<CalendarEvent?> MoveAsync(string id, DateTimeOffset start, DateTimeOffset end, CancellationToken cancellationToken)
    {
        var body = new
        {
            start = new { dateTime = start.ToString("O", CultureInfo.InvariantCulture), timeZone = zone.Id },
            end = new { dateTime = end.ToString("O", CultureInfo.InvariantCulture), timeZone = zone.Id },
        };
        try
        {
            return Parse(await google.PatchAsync($"{Events}/{Uri.EscapeDataString(id)}", body, cancellationToken));
        }
        catch (GoogleApiException e) when (e.Status is 404 or 410)
        {
            return null;
        }
    }

    internal CalendarEvent Parse(JsonElement e) => new(
        e.GetProperty("id").GetString()!,
        e.TryGetProperty("summary", out var summary) ? summary.GetString() ?? "(utan titel)" : "(utan titel)",
        Time(e.GetProperty("start")),
        Time(e.GetProperty("end")),
        e.TryGetProperty("location", out var location) ? location.GetString() : null,
        Suggested: false);

    /// <summary>Timed events carry dateTime; all-day events carry only a date, which starts at local midnight.</summary>
    private DateTimeOffset Time(JsonElement when) =>
        when.TryGetProperty("dateTime", out var dateTime)
            ? DateTimeOffset.Parse(dateTime.GetString()!, CultureInfo.InvariantCulture)
            : StartOf(DateOnly.ParseExact(when.GetProperty("date").GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture));

    private DateTimeOffset StartOf(DateOnly date)
    {
        var local = date.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(local, zone.GetUtcOffset(local));
    }
}
