namespace VeloqOS.Api.Services;

/// <summary>
/// Runs chores as jobs. For now a job is simulated: its progress is the share of the chore's
/// duration that has passed, read from <see cref="TimeProvider"/> so tests can move time.
/// </summary>
public sealed class JobService(TimeProvider time)
{
    private readonly Lock _gate = new();
    private readonly List<JobRecord> _jobs = [];

    public Job Start(Chore chore)
    {
        var record = new JobRecord(Guid.NewGuid().ToString("n"), chore, time.GetUtcNow());
        lock (_gate) _jobs.Add(record);
        return Snapshot(record);
    }

    public IReadOnlyList<Job> List()
    {
        lock (_gate)
        {
            return _jobs.OrderByDescending(j => j.StartedAt).Select(Snapshot).ToList();
        }
    }

    public int RunningCount() => List().Count(j => j.Status == JobStatus.Running);

    private Job Snapshot(JobRecord record)
    {
        var elapsed = time.GetUtcNow() - record.StartedAt;
        var progress = Math.Clamp(elapsed / record.Chore.Duration, 0, 1);
        var done = progress >= 1;
        return new Job(
            record.Id,
            record.Chore.Id,
            record.Chore.Name,
            done ? "Klart" : StepFor(progress),
            Math.Round(progress, 3),
            done ? JobStatus.Done : JobStatus.Running,
            record.StartedAt,
            done ? "Klart. Sammanfattning i inkorgen." : null);
    }

    private static string StepFor(double progress) => progress switch
    {
        < 0.25 => "Förbereder…",
        < 0.75 => "Kör på datorn…",
        _ => "Skriver sammanfattning…",
    };

    private sealed record JobRecord(string Id, Chore Chore, DateTimeOffset StartedAt);
}

public static class JobStatus
{
    public const string Running = "running";
    public const string Done = "done";
}
