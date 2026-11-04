using VeloqOS.Api.Data;
using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Services;

/// <summary>A routine and when it runs: on <c>Days</c> at <c>At</c>, local time in <c>Veloq:TimeZone</c>.</summary>
public sealed record RoutinePlan(Routine Routine, IReadOnlyCollection<DayOfWeek> Days, TimeOnly At);

/// <summary>
/// Routines, whether they are on and when they run next. <see cref="Due"/> says which ones
/// <see cref="RoutineScheduler"/> should start: the latest scheduled time has passed, at most
/// <see cref="CatchUp"/> ago (the computer may have slept through it), and it has not run for that time yet.
/// </summary>
public sealed class RoutineService(TimeProvider time, TimeZoneInfo zone)
{
    public static readonly TimeSpan CatchUp = TimeSpan.FromHours(3);

    private sealed class State(RoutinePlan plan)
    {
        public RoutinePlan Plan { get; } = plan;
        public bool Enabled { get; set; } = plan.Routine.Enabled;
        public DateTimeOffset? LastRunAt { get; set; }
        public DateTimeOffset? LastOccurrence { get; set; }
    }

    private readonly Lock _gate = new();
    private readonly List<State> _routines = SampleData.Routines.Select(p => new State(p)).ToList();

    public IReadOnlyList<Routine> List()
    {
        lock (_gate) return _routines.Select(Snapshot).ToList();
    }

    public Routine? Find(string id)
    {
        lock (_gate) return _routines.FirstOrDefault(r => r.Plan.Routine.Id == id) is { } state ? Snapshot(state) : null;
    }

    public Routine? SetEnabled(string id, bool enabled)
    {
        lock (_gate)
        {
            var state = _routines.FirstOrDefault(r => r.Plan.Routine.Id == id);
            if (state is null) return null;
            state.Enabled = enabled;
            return Snapshot(state);
        }
    }

    /// <summary>Records a run now, started by hand or by the schedule.</summary>
    public void MarkRun(string id)
    {
        lock (_gate)
        {
            var state = _routines.First(r => r.Plan.Routine.Id == id);
            state.LastRunAt = time.GetUtcNow();
        }
    }

    /// <summary>The routines to start now. Each scheduled time is handed out once.</summary>
    public IReadOnlyList<Routine> Due()
    {
        var now = time.GetUtcNow();
        lock (_gate)
        {
            var due = new List<Routine>();
            foreach (var state in _routines.Where(r => r.Enabled))
            {
                var occurrence = Previous(state.Plan, now);
                if (occurrence is null || now - occurrence > CatchUp || state.LastOccurrence >= occurrence) continue;
                state.LastOccurrence = occurrence;
                due.Add(Snapshot(state));
            }
            return due;
        }
    }

    private Routine Snapshot(State state) => state.Plan.Routine with
    {
        Enabled = state.Enabled,
        NextRunAt = state.Enabled ? Next(state.Plan, time.GetUtcNow()) : null,
        LastRunAt = state.LastRunAt,
    };

    /// <summary>The latest scheduled time at or before <paramref name="now"/>, within the past week.</summary>
    public DateTimeOffset? Previous(RoutinePlan plan, DateTimeOffset now) =>
        Occurrences(plan, DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, zone).DateTime), -1).FirstOrDefault(o => o <= now);

    /// <summary>The first scheduled time after <paramref name="now"/>.</summary>
    public DateTimeOffset? Next(RoutinePlan plan, DateTimeOffset now) =>
        Occurrences(plan, DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, zone).DateTime), 1).FirstOrDefault(o => o > now);

    private IEnumerable<DateTimeOffset?> Occurrences(RoutinePlan plan, DateOnly from, int step)
    {
        for (var i = 0; i <= 7; i++)
        {
            var day = from.AddDays(i * step);
            if (!plan.Days.Contains(day.DayOfWeek)) continue;
            var local = day.ToDateTime(plan.At);
            if (zone.IsInvalidTime(local)) continue; // skipped by a DST change
            yield return new DateTimeOffset(local, zone.GetUtcOffset(local));
        }
    }
}

/// <summary>Starts due routines as jobs, checking every half minute.</summary>
public sealed class RoutineScheduler(RoutineService routines, RoutineRunner runner, TimeProvider time, ILogger<RoutineScheduler> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30), time);
        do
        {
            foreach (var routine in routines.Due())
            {
                logger.LogInformation("Running routine {Routine}", routine.Id);
                runner.Run(routine);
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}

/// <summary>Runs a routine's chore as a job, in <c>Veloq:CodeHome</c>.</summary>
public sealed class RoutineRunner(RoutineService routines, ChoreCatalog chores, JobService jobs, ProjectCatalog projects)
{
    public Job Run(Routine routine)
    {
        var chore = chores.Find(routine.ChoreId) ?? throw new InvalidOperationException($"Rutinen {routine.Id} pekar på en chore som saknas: {routine.ChoreId}");
        routines.MarkRun(routine.Id);
        return jobs.Start(chore, new ChoreContext(null, projects.CodeHome));
    }
}
