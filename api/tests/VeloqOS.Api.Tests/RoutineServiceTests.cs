using VeloqOS.Api.Services;

namespace VeloqOS.Api.Tests;

/// <summary>Schedules in Stockholm time. 29 October 2026 is a Thursday, after the switch to winter time (UTC+1).</summary>
public class RoutineServiceTests
{
    private static readonly TimeZoneInfo Stockholm = TimeZoneInfo.FindSystemTimeZoneById("Europe/Stockholm");

    private static DateTimeOffset Local(int month, int day, int hour, int minute) =>
        new(2026, month, day, hour, minute, 0, Stockholm.GetUtcOffset(new DateTime(2026, month, day, hour, minute, 0)));

    private static (RoutineService Service, ManualTimeProvider Time) At(DateTimeOffset now)
    {
        var time = new ManualTimeProvider(now);
        return (new RoutineService(time, Stockholm), time);
    }

    [Fact]
    public void Each_routine_knows_its_chore_and_next_run()
    {
        var (routines, _) = At(Local(10, 29, 14, 0));

        var all = routines.List();

        var brief = all.Single(r => r.Id == "morning-brief");
        Assert.Equal("morning-brief", brief.ChoreId);
        Assert.Equal(Local(10, 30, 7, 40), brief.NextRunAt); // Friday morning
        Assert.Equal(Local(10, 29, 16, 30), all.Single(r => r.Id == "inbox-review").NextRunAt);
        Assert.Equal(Local(11, 1, 20, 0), all.Single(r => r.Id == "memory-cleanup").NextRunAt); // Sunday
        Assert.Null(all.Single(r => r.Id == "week-review").NextRunAt); // off
        Assert.All(all, r => Assert.Null(r.LastRunAt));
    }

    [Fact]
    public void The_morning_brief_skips_the_weekend()
    {
        var (routines, _) = At(Local(10, 30, 9, 0)); // Friday

        Assert.Equal(Local(11, 2, 7, 40), routines.Find("morning-brief")!.NextRunAt); // Monday
    }

    [Fact]
    public void A_routine_is_due_once_after_its_time()
    {
        var (routines, time) = At(Local(10, 29, 16, 29));
        Assert.DoesNotContain(routines.Due(), r => r.Id == "inbox-review");

        time.Advance(TimeSpan.FromMinutes(1));
        Assert.Contains(routines.Due(), r => r.Id == "inbox-review");

        time.Advance(TimeSpan.FromMinutes(1));
        Assert.DoesNotContain(routines.Due(), r => r.Id == "inbox-review");
    }

    [Fact]
    public void A_missed_routine_runs_within_three_hours_but_not_later()
    {
        var (late, _) = At(Local(10, 29, 9, 0)); // the Mac slept through 07:30 and 07:40
        Assert.Equal(["artifact-sync", "morning-brief"], late.Due().Select(r => r.Id).Order());

        var (tooLate, _) = At(Local(10, 29, 11, 0));
        Assert.Empty(tooLate.Due());
    }

    [Fact]
    public void A_routine_that_is_off_is_never_due()
    {
        var (routines, _) = At(Local(10, 29, 16, 31));
        routines.SetEnabled("inbox-review", false);

        Assert.Empty(routines.Due());
    }

    [Fact]
    public void Running_by_hand_is_recorded()
    {
        var (routines, _) = At(Local(10, 29, 14, 0));

        routines.MarkRun("week-review");

        Assert.Equal(Local(10, 29, 14, 0), routines.Find("week-review")!.LastRunAt);
    }

    [Fact]
    public void Summer_time_is_respected()
    {
        var now = new DateTimeOffset(2026, 10, 23, 12, 0, 0, TimeSpan.FromHours(2)); // Friday, still summer time
        var (routines, _) = At(now);
        var weekReview = Api.Data.SampleData.Routines.Single(r => r.Routine.Id == "week-review");

        Assert.Equal(new DateTimeOffset(2026, 10, 23, 15, 0, 0, TimeSpan.FromHours(2)), routines.Next(weekReview, now));
        Assert.Equal(new DateTimeOffset(2026, 10, 30, 15, 0, 0, TimeSpan.FromHours(1)), routines.Next(weekReview, now.AddDays(1)));
    }
}
