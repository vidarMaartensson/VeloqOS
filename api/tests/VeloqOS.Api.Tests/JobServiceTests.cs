using VeloqOS.Api.Services;

namespace VeloqOS.Api.Tests;

public class JobServiceTests
{
    private static readonly Chore TenSeconds = new("c", "Test", "", "memory", "", TimeSpan.FromSeconds(10));

    [Fact]
    public void New_job_is_running_with_no_progress()
    {
        var jobs = new JobService(new ManualTimeProvider(DateTimeOffset.UnixEpoch));

        var job = jobs.Start(TenSeconds);

        Assert.Equal(JobStatus.Running, job.Status);
        Assert.Equal(0.0, job.Progress);
        Assert.Null(job.Result);
    }

    [Fact]
    public void Progress_follows_elapsed_time()
    {
        var time = new ManualTimeProvider(DateTimeOffset.UnixEpoch);
        var jobs = new JobService(time);
        jobs.Start(TenSeconds);

        time.Advance(TimeSpan.FromSeconds(5));

        var job = Assert.Single(jobs.List());
        Assert.Equal(0.5, job.Progress);
        Assert.Equal("Kör på datorn…", job.Step);
        Assert.Equal(1, jobs.RunningCount());
    }

    [Fact]
    public void Job_is_done_with_a_result_after_its_duration()
    {
        var time = new ManualTimeProvider(DateTimeOffset.UnixEpoch);
        var jobs = new JobService(time);
        jobs.Start(TenSeconds);

        time.Advance(TimeSpan.FromSeconds(30));

        var job = Assert.Single(jobs.List());
        Assert.Equal(JobStatus.Done, job.Status);
        Assert.Equal(1.0, job.Progress);
        Assert.NotNull(job.Result);
        Assert.Equal(0, jobs.RunningCount());
    }

    [Fact]
    public void Newest_job_is_listed_first()
    {
        var time = new ManualTimeProvider(DateTimeOffset.UnixEpoch);
        var jobs = new JobService(time);
        jobs.Start(TenSeconds with { Name = "Först" });
        time.Advance(TimeSpan.FromSeconds(1));
        jobs.Start(TenSeconds with { Name = "Sist" });

        Assert.Equal(new[] { "Sist", "Först" }, jobs.List().Select(j => j.Title));
    }
}
