namespace VeloqOS.Api.Integrations;

/// <summary>Calendar source. Google Calendar comes later.</summary>
public interface ICalendarProvider
{
    bool IsConnected { get; }

    /// <summary>Starts connecting. Returns an OAuth URL when the user must sign in, otherwise null.</summary>
    Task<string?> ConnectAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<CalendarEvent>> GetEventsAsync(DateOnly date, CancellationToken cancellationToken);

    Task<CalendarEvent> CreateAsync(CalendarEvent calendarEvent, CancellationToken cancellationToken);
}

/// <summary>
/// Example calendar: not connected until <see cref="ConnectAsync"/> is called, then a fixed
/// set of placeholder meetings for any date, plus one focus-time suggestion from Veloq OS.
/// </summary>
public sealed class SampleCalendarProvider(TimeZoneInfo zone) : ICalendarProvider
{
    private readonly Lock _gate = new();
    private readonly HashSet<string> _booked = [];
    private bool _connected;

    public bool IsConnected
    {
        get { lock (_gate) return _connected; }
    }

    public Task<string?> ConnectAsync(CancellationToken cancellationToken)
    {
        lock (_gate) _connected = true;
        return Task.FromResult<string?>(null);
    }

    public Task<IReadOnlyList<CalendarEvent>> GetEventsAsync(DateOnly date, CancellationToken cancellationToken)
    {
        if (!IsConnected) return Task.FromResult<IReadOnlyList<CalendarEvent>>([]);

        var key = date.ToString("yyyyMMdd", System.Globalization.CultureInfo.InvariantCulture);
        IReadOnlyList<CalendarEvent> events =
        [
            Event($"{key}-e1", "[Möte]", date, 8, 30, 30, "Google Meet", false),
            Event($"{key}-s1", "Fokus · Halo Home motion", date, 9, 0, 120, null, suggested: !IsBooked($"{key}-s1")),
            Event($"{key}-e2", "[Möte]", date, 13, 0, 60, "[plats]", false),
            Event($"{key}-e3", "[Händelse]", date, 18, 30, 90, null, false),
        ];
        return Task.FromResult(events);
    }

    public Task<CalendarEvent> CreateAsync(CalendarEvent calendarEvent, CancellationToken cancellationToken)
    {
        lock (_gate) _booked.Add(calendarEvent.Id);
        return Task.FromResult(calendarEvent with { Suggested = false });
    }

    private bool IsBooked(string id)
    {
        lock (_gate) return _booked.Contains(id);
    }

    private CalendarEvent Event(string id, string title, DateOnly date, int hour, int minute, int minutes, string? location, bool suggested)
    {
        var local = date.ToDateTime(new TimeOnly(hour, minute));
        var start = new DateTimeOffset(local, zone.GetUtcOffset(local));
        return new CalendarEvent(id, title, start, start.AddMinutes(minutes), location, suggested);
    }
}
