using Microsoft.Extensions.Logging.Abstractions;
using VeloqOS.Api.Services;
using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Tests;

/// <summary>
/// Jobs run through a handler the test finishes by hand. Progress is still an estimate from the clock,
/// but a job is only done when its handler has answered – it used to be done when the time had passed.
/// </summary>
public class JobServiceTests
{
    private sealed class ManualHandler : IChoreHandler
    {
        public TaskCompletionSource<ChoreOutcome> Run { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource<ChoreOutcome> Confirmed { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public IReadOnlyList<JobChoice>? Picked { get; private set; }

        public bool Handles(Chore chore) => true;

        public Task<ChoreOutcome> RunAsync(Chore chore, ChoreContext context, CancellationToken cancellationToken) => Run.Task;

        public Task<ChoreOutcome> ConfirmAsync(Chore chore, ChoreContext context, ChoreOutcome proposal, IReadOnlyList<JobChoice> picked, CancellationToken cancellationToken)
        {
            Picked = picked;
            return Confirmed.Task;
        }
    }

    private static readonly Chore TenSeconds = new("c", "Test", "", "memory", "", TimeSpan.FromSeconds(10));
    private static readonly ChoreContext Here = new(null, "/tmp");
    private static readonly IReadOnlyList<JobChoice> TwoChoices = [new("a", "A", "första"), new("b", "B", "andra")];

    private readonly ManualTimeProvider _time = new(DateTimeOffset.UnixEpoch);
    private readonly ManualHandler _handler = new();
    private readonly JobService _jobs;

    public JobServiceTests() => _jobs = new JobService(_time, [_handler], NullLogger<JobService>.Instance);

    [Fact]
    public void New_job_is_running_with_no_progress()
    {
        var job = _jobs.Start(TenSeconds, Here);

        Assert.Equal(JobStatus.Running, job.Status);
        Assert.Equal(0.0, job.Progress);
        Assert.Null(job.Result);
    }

    [Fact]
    public void Progress_follows_elapsed_time()
    {
        _jobs.Start(TenSeconds, Here);

        _time.Advance(TimeSpan.FromSeconds(5));

        var job = Assert.Single(_jobs.List());
        Assert.Equal(0.5, job.Progress);
        Assert.Equal("Kör på datorn…", job.Step);
        Assert.Equal(1, _jobs.RunningCount());
    }

    [Fact]
    public void A_slow_job_stays_running_below_full_progress()
    {
        _jobs.Start(TenSeconds, Here);

        _time.Advance(TimeSpan.FromMinutes(5));

        var job = Assert.Single(_jobs.List());
        Assert.Equal(JobStatus.Running, job.Status);
        Assert.Equal(0.9, job.Progress);
    }

    [Fact]
    public async Task Job_is_done_with_the_handlers_result()
    {
        var job = _jobs.Start(TenSeconds with { Name = "Rensa" }, Here with { Project = new Project("p", "Proj", "", "", 3, "", "") });

        _handler.Run.SetResult(new ChoreOutcome("Allt klart."));
        await _jobs.WhenDone(job.Id);

        var done = Assert.Single(_jobs.List());
        Assert.Equal(JobStatus.Done, done.Status);
        Assert.Equal(1.0, done.Progress);
        Assert.Equal("Allt klart.", done.Result);
        Assert.Equal("Proj", done.Project);
        Assert.Null(done.Choices);
        Assert.Equal(0, _jobs.RunningCount());
    }

    [Fact]
    public async Task Job_fails_with_the_handlers_message()
    {
        var job = _jobs.Start(TenSeconds, Here);

        _handler.Run.SetException(new InvalidOperationException("Claude Code svarade inte."));
        await _jobs.WhenDone(job.Id);

        var failed = Assert.Single(_jobs.List());
        Assert.Equal(JobStatus.Failed, failed.Status);
        Assert.Equal("Claude Code svarade inte.", failed.Result);
    }

    [Fact]
    public void Newest_job_is_listed_first()
    {
        _jobs.Start(TenSeconds with { Name = "Först" }, Here);
        _time.Advance(TimeSpan.FromSeconds(1));
        _jobs.Start(TenSeconds with { Name = "Sist" }, Here);

        Assert.Equal(new[] { "Sist", "Först" }, _jobs.List().Select(j => j.Title));
    }

    [Fact]
    public async Task A_proposal_waits_for_approval_and_confirming_starts_a_new_job()
    {
        var job = _jobs.Start(TenSeconds, Here);
        _handler.Run.SetResult(new ChoreOutcome("Hittade två.", TwoChoices, "Rensa valda"));
        await _jobs.WhenDone(job.Id);

        var waiting = Assert.Single(_jobs.List());
        Assert.Equal(TwoChoices, waiting.Choices);
        Assert.Equal("Rensa valda", waiting.Confirm);

        var result = _jobs.Confirm(job.Id, ["b"]);

        Assert.Equal(ConfirmStatus.Started, result.Status);
        Assert.NotEqual(job.Id, result.Job!.Id);
        _handler.Confirmed.SetResult(new ChoreOutcome("Rensade B."));
        await _jobs.WhenDone(result.Job.Id);
        Assert.Equal([TwoChoices[1]], _handler.Picked);

        var original = _jobs.List().Single(j => j.Id == job.Id);
        Assert.Null(original.Choices);
        Assert.Null(original.Confirm);
        Assert.Equal("Rensade B.", _jobs.List().Single(j => j.Id == result.Job.Id).Result);
    }

    [Fact]
    public async Task Confirm_checks_the_job_and_the_choices()
    {
        Assert.Equal(ConfirmStatus.NotFound, _jobs.Confirm("nope", ["a"]).Status);

        var job = _jobs.Start(TenSeconds, Here);
        Assert.Equal(ConfirmStatus.NotWaiting, _jobs.Confirm(job.Id, ["a"]).Status); // still running

        _handler.Run.SetResult(new ChoreOutcome("Hittade två.", TwoChoices, "Rensa valda"));
        await _jobs.WhenDone(job.Id);
        Assert.Equal(ConfirmStatus.Invalid, _jobs.Confirm(job.Id, []).Status);
        Assert.Equal(ConfirmStatus.Invalid, _jobs.Confirm(job.Id, ["a", "x"]).Status);

        Assert.Equal(ConfirmStatus.Started, _jobs.Confirm(job.Id, ["a"]).Status);
        Assert.Equal(ConfirmStatus.NotWaiting, _jobs.Confirm(job.Id, ["a"]).Status); // already approved
    }

    [Fact]
    public async Task A_job_without_choices_has_nothing_to_confirm()
    {
        var job = _jobs.Start(TenSeconds, Here);
        _handler.Run.SetResult(new ChoreOutcome("Klart."));
        await _jobs.WhenDone(job.Id);

        Assert.Equal(ConfirmStatus.NotWaiting, _jobs.Confirm(job.Id, ["a"]).Status);
    }
}
