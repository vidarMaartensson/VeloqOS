using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Services;

/// <summary>
/// Runs chores as background jobs through the first <see cref="IChoreHandler"/> that takes them.
/// Progress is an estimate – the share of the chore's usual duration that has passed, read from
/// <see cref="TimeProvider"/> – and stays below 1 until the handler has answered.
/// </summary>
public sealed class JobService(TimeProvider time, IEnumerable<IChoreHandler> handlers, ILogger<JobService> logger) : IDisposable
{
    private const double MaxRunningProgress = 0.9;

    private readonly Lock _gate = new();
    private readonly List<JobRecord> _jobs = [];
    private readonly CancellationTokenSource _stopping = new();

    public Job Start(Chore chore, ChoreContext context)
    {
        var handler = HandlerFor(chore);
        return Launch(chore, context, ct => handler.RunAsync(chore, context, ct));
    }

    /// <summary>Approves some of a finished job's choices and starts a new job that carries them out.</summary>
    public ConfirmResult Confirm(string jobId, IReadOnlyList<string> choiceIds)
    {
        JobRecord job;
        IReadOnlyList<JobChoice> picked;
        lock (_gate)
        {
            var found = _jobs.FirstOrDefault(j => j.Id == jobId);
            if (found is null) return new ConfirmResult(ConfirmStatus.NotFound);
            if (found.Status != JobStatus.Done || found.Confirmed || found.Outcome?.Choices is not { Count: > 0 } choices)
                return new ConfirmResult(ConfirmStatus.NotWaiting);
            if (choiceIds.Count == 0 || choiceIds.Any(id => choices.All(c => c.Id != id)))
                return new ConfirmResult(ConfirmStatus.Invalid);

            found.Confirmed = true;
            job = found;
            picked = choices.Where(c => choiceIds.Contains(c.Id)).ToList();
        }

        var handler = HandlerFor(job.Chore);
        var proposal = job.Outcome!;
        return new ConfirmResult(ConfirmStatus.Started,
            Launch(job.Chore, job.Context, ct => handler.ConfirmAsync(job.Chore, job.Context, proposal, picked, ct)));
    }

    public IReadOnlyList<Job> List()
    {
        lock (_gate)
        {
            return _jobs.OrderByDescending(j => j.StartedAt).Select(Snapshot).ToList();
        }
    }

    public int RunningCount() => List().Count(j => j.Status == JobStatus.Running);

    /// <summary>Completes when the job has finished, whether it succeeded or not. For tests.</summary>
    public Task WhenDone(string jobId)
    {
        lock (_gate) return _jobs.First(j => j.Id == jobId).Completion;
    }

    public void Dispose()
    {
        _stopping.Cancel();
        _stopping.Dispose();
    }

    private IChoreHandler HandlerFor(Chore chore) => handlers.First(h => h.Handles(chore));

    private Job Launch(Chore chore, ChoreContext context, Func<CancellationToken, Task<ChoreOutcome>> work)
    {
        var record = new JobRecord(Guid.NewGuid().ToString("n"), chore, context, time.GetUtcNow());
        lock (_gate)
        {
            _jobs.Add(record);
            record.Completion = Task.Run(() => RunAsync(record, work));
            return Snapshot(record);
        }
    }

    private async Task RunAsync(JobRecord record, Func<CancellationToken, Task<ChoreOutcome>> work)
    {
        try
        {
            var outcome = await work(_stopping.Token);
            lock (_gate)
            {
                record.Outcome = outcome;
                record.Status = JobStatus.Done;
                record.FinishedAt = time.GetUtcNow();
            }
        }
        catch (Exception e)
        {
            if (e is not OperationCanceledException) logger.LogWarning(e, "Chore {Chore} failed", record.Chore.Id);
            lock (_gate)
            {
                record.Error = e is OperationCanceledException ? "Avbröts." : e.Message;
                record.Status = JobStatus.Failed;
                record.FinishedAt = time.GetUtcNow();
            }
        }
    }

    private Job Snapshot(JobRecord record)
    {
        var project = record.Context.Project?.Name;
        if (record.Status == JobStatus.Running)
        {
            var elapsed = time.GetUtcNow() - record.StartedAt;
            var progress = Math.Clamp(elapsed / record.Chore.Duration, 0, MaxRunningProgress);
            return new Job(record.Id, record.Chore.Id, record.Chore.Name, project, StepFor(progress), Math.Round(progress, 3),
                JobStatus.Running, record.StartedAt, null);
        }

        if (record.Status == JobStatus.Failed)
            return new Job(record.Id, record.Chore.Id, record.Chore.Name, project, "Misslyckades", 1, JobStatus.Failed,
                record.StartedAt, record.Error, FinishedAt: record.FinishedAt);

        var outcome = record.Outcome!;
        var waiting = !record.Confirmed && outcome.Choices is { Count: > 0 };
        return new Job(record.Id, record.Chore.Id, record.Chore.Name, project, "Klart", 1, JobStatus.Done, record.StartedAt,
            outcome.Result, waiting ? outcome.Choices : null, waiting ? outcome.Confirm : null, record.FinishedAt);
    }

    private static string StepFor(double progress) => progress switch
    {
        < 0.25 => "Förbereder…",
        < 0.75 => "Kör på datorn…",
        _ => "Skriver sammanfattning…",
    };

    private sealed class JobRecord(string id, Chore chore, ChoreContext context, DateTimeOffset startedAt)
    {
        public string Id { get; } = id;
        public Chore Chore { get; } = chore;
        public ChoreContext Context { get; } = context;
        public DateTimeOffset StartedAt { get; } = startedAt;
        public string Status { get; set; } = JobStatus.Running;
        public ChoreOutcome? Outcome { get; set; }
        public string? Error { get; set; }
        public DateTimeOffset? FinishedAt { get; set; }
        public bool Confirmed { get; set; }
        public Task Completion { get; set; } = Task.CompletedTask;
    }
}

public static class JobStatus
{
    public const string Running = "running";
    public const string Done = "done";
    public const string Failed = "failed";
}

public enum ConfirmStatus { Started, NotFound, NotWaiting, Invalid }

public sealed record ConfirmResult(ConfirmStatus Status, Job? Job = null);
