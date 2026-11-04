using VeloqOS.Api.Integrations.Google;

namespace VeloqOS.Api.Integrations;

/// <summary>Calendar source: <see cref="GoogleCalendarProvider"/> when Google is configured, otherwise the sample.</summary>
public interface ICalendarProvider
{
    bool IsConnected { get; }

    /// <summary>Starts connecting. Returns an OAuth URL when the user must sign in, otherwise null.</summary>
    Task<string?> ConnectAsync(OAuthRedirect redirect, CancellationToken cancellationToken);

    Task<IReadOnlyList<CalendarEvent>> GetEventsAsync(DateOnly date, CancellationToken cancellationToken);

    /// <summary>Adds the event to the calendar. An empty <see cref="CalendarEvent.Id"/> means a new event.</summary>
    Task<CalendarEvent> CreateAsync(CalendarEvent calendarEvent, CancellationToken cancellationToken);

    /// <summary>Moves an existing event. Null when there is no such event.</summary>
    Task<CalendarEvent?> MoveAsync(string id, DateTimeOffset start, DateTimeOffset end, CancellationToken cancellationToken);
}

/// <summary>
/// Example calendar: not connected until <see cref="ConnectAsync"/> is called, then a fixed
/// set of placeholder meetings for any date, plus one focus-time suggestion from Veloq OS
/// and whatever has been added through <see cref="CreateAsync"/>.
/// </summary>
public sealed class SampleCalendarProvider(TimeZoneInfo zone) : ICalendarProvider
{
    private readonly Lock _gate = new();
    private readonly HashSet<string> _booked = [];
    private readonly List<CalendarEvent> _added = [];
    private readonly Dictionary<string, (DateTimeOffset Start, DateTimeOffset End)> _moved = [];
    private bool _connected;

    public bool IsConnected
    {
        get { lock (_gate) return _connected; }
    }

    public Task<string?> ConnectAsync(OAuthRedirect redirect, CancellationToken cancellationToken)
    {
        lock (_gate) _connected = true;
        return Task.FromResult<string?>(null);
    }

    public Task<IReadOnlyList<CalendarEvent>> GetEventsAsync(DateOnly date, CancellationToken cancellationToken)
    {
        if (!IsConnected) return Task.FromResult<IReadOnlyList<CalendarEvent>>([]);

        List<CalendarEvent> events;
        lock (_gate)
        {
            // The day's own events, the added ones, and any event moved here from another day.
            var days = _moved.Keys.Select(Origin).OfType<DateOnly>().Append(date).Distinct();
            events = days.SelectMany(Generated).Concat(_added)
                .Select(e => _moved.TryGetValue(e.Id, out var to) ? e with { Start = to.Start, End = to.End } : e)
                .Where(e => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(e.Start, zone).DateTime) == date)
                .ToList();
        }
        return Task.FromResult<IReadOnlyList<CalendarEvent>>(events.OrderBy(e => e.Start).ToList());
    }

    /// <summary>The placeholder events every day has; ids start with the day.</summary>
    private IEnumerable<CalendarEvent> Generated(DateOnly date)
    {
        var key = date.ToString("yyyyMMdd", System.Globalization.CultureInfo.InvariantCulture);
        yield return Event($"{key}-e1", "[Möte]", date, 8, 30, 30, "Google Meet", false);
        yield return Event($"{key}-s1", "Fokus · Halo Home motion", date, 9, 0, 120, null, suggested: !_booked.Contains($"{key}-s1"));
        yield return Event($"{key}-e2", "[Möte]", date, 13, 0, 60, "[plats]", false);
        yield return Event($"{key}-e3", "[Händelse]", date, 18, 30, 90, null, false);
    }

    private static DateOnly? Origin(string id) =>
        id.Length >= 8 && DateOnly.TryParseExact(id[..8], "yyyyMMdd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var day)
            ? day
            : null;

    public Task<CalendarEvent> CreateAsync(CalendarEvent calendarEvent, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            if (calendarEvent.Id.Length > 0)
            {
                _booked.Add(calendarEvent.Id);
                return Task.FromResult(calendarEvent with { Suggested = false });
            }

            var added = calendarEvent with { Id = $"added-{_added.Count + 1}", Suggested = false };
            _added.Add(added);
            return Task.FromResult(added);
        }
    }

    public Task<CalendarEvent?> MoveAsync(string id, DateTimeOffset start, DateTimeOffset end, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            var current = Origin(id) is { } day ? Generated(day).FirstOrDefault(e => e.Id == id) : _added.FirstOrDefault(e => e.Id == id);
            if (!_connected || current is null || current.Suggested) return Task.FromResult<CalendarEvent?>(null);
            _moved[id] = (start, end);
            return Task.FromResult<CalendarEvent?>(current with { Start = start, End = end });
        }
    }

    private CalendarEvent Event(string id, string title, DateOnly date, int hour, int minute, int minutes, string? location, bool suggested)
    {
        var local = date.ToDateTime(new TimeOnly(hour, minute));
        var start = new DateTimeOffset(local, zone.GetUtcOffset(local));
        return new CalendarEvent(id, title, start, start.AddMinutes(minutes), location, suggested);
    }
}
