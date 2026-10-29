using System.Globalization;
using VeloqOS.Api.Data;
using VeloqOS.Api.Integrations;
using VeloqOS.Api.Services;

namespace VeloqOS.Api.Endpoints;

public static class Endpoints
{
    public static WebApplication MapVeloqEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/health", () => new { status = "ok", version = "0.1.0" });

        api.MapGet("/overview", async (JobService jobs, InboxService inbox, RoutineService routines, CancellationToken ct) =>
        {
            var routineList = routines.List();
            return new Overview(
                Projects: SampleData.Projects.Count,
                ActiveProjects: SampleData.Projects.Count(p => p.Tier == 3),
                RunningJobs: jobs.RunningCount(),
                InboxNeedsYou: await inbox.NeedsYouAsync(ct),
                RoutinesOn: routineList.Count(r => r.Enabled),
                RoutinesTotal: routineList.Count,
                Artifacts: SampleData.Artifacts.Count);
        });

        api.MapGet("/projects", () => SampleData.Projects);

        MapChores(api);
        MapRoutines(api);
        MapInbox(api);
        MapCalendar(api);

        api.MapGet("/artifacts", (string? group) =>
            SampleData.Artifacts.Where(a => group is null || a.Group == group).OrderByDescending(a => a.UpdatedAt));

        api.MapPost("/prompt", async (PromptRequest request, IAgent agent, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Text))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["text"] = ["Skriv något först."] });
            var reply = await agent.ReplyAsync(request.Text, request.Context, ct);
            return Results.Ok(new PromptResponse(reply));
        });

        return app;
    }

    private static void MapChores(RouteGroupBuilder api)
    {
        api.MapGet("/chores", () => SampleData.Chores.Select(c => new { c.Id, c.Name, c.Description, c.Icon, c.Estimate }));

        api.MapPost("/chores/{id}/run", (string id, JobService jobs) =>
        {
            var chore = SampleData.Chores.FirstOrDefault(c => c.Id == id);
            if (chore is null) return Results.NotFound();
            var job = jobs.Start(chore);
            return Results.Accepted($"/api/jobs/{job.Id}", job);
        });

        api.MapGet("/jobs", (JobService jobs) => jobs.List());
    }

    private static void MapRoutines(RouteGroupBuilder api)
    {
        api.MapGet("/routines", (RoutineService routines) => routines.List());

        api.MapPut("/routines/{id}", (string id, RoutineUpdate update, RoutineService routines) =>
            routines.SetEnabled(id, update.Enabled) is { } routine ? Results.Ok(routine) : Results.NotFound());
    }

    private static void MapInbox(RouteGroupBuilder api)
    {
        api.MapGet("/inbox", async (string? tag, InboxService inbox, CancellationToken ct) =>
        {
            if (tag is not null && !InboxTags.All.Contains(tag))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["tag"] = [$"Okänd tagg: {tag}"] });
            return Results.Ok(await inbox.ListAsync(tag, ct));
        });

        api.MapPost("/inbox/{id}/actions", async (string id, InboxActionRequest request, InboxService inbox, CancellationToken ct) =>
        {
            try
            {
                var item = await inbox.ApplyAsync(id, request.Action, request.Body, ct);
                return item is null ? Results.NotFound() : Results.Ok(item);
            }
            catch (ArgumentException e)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { [e.ParamName ?? "action"] = [e.Message.Split(" (")[0]] });
            }
        });

        api.MapDelete("/inbox/{id}/actions", async (string id, InboxService inbox, CancellationToken ct) =>
            await inbox.UndoAsync(id, ct) is { } item ? Results.Ok(item) : Results.NotFound());

        api.MapPost("/inbox/clear-noise", async (InboxService inbox, CancellationToken ct) =>
            new { archived = await inbox.ClearNoiseAsync(ct) });
    }

    private static void MapCalendar(RouteGroupBuilder api)
    {
        api.MapGet("/calendar", async (string? date, ICalendarProvider calendar, TimeProvider time, TimeZoneInfo zone, CancellationToken ct) =>
        {
            DateOnly day;
            if (date is null)
            {
                day = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time.GetUtcNow(), zone).DateTime);
            }
            else if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["date"] = ["Använd formatet ÅÅÅÅ-MM-DD."] });
            }

            var events = await calendar.GetEventsAsync(day, ct);
            return Results.Ok(new CalendarDay(calendar.IsConnected, day, events));
        });

        api.MapPost("/calendar/connect", async (ICalendarProvider calendar, CancellationToken ct) =>
        {
            var authUrl = await calendar.ConnectAsync(ct);
            return new CalendarConnectResult(calendar.IsConnected, authUrl);
        });

        api.MapPost("/calendar/suggestions/{id}/book", async (string id, ICalendarProvider calendar, CancellationToken ct) =>
        {
            if (!calendar.IsConnected) return Results.Conflict(new { error = "Kalendern är inte ansluten." });
            if (id.Length < 8 || !DateOnly.TryParseExact(id[..8], "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
                return Results.NotFound();

            var suggestion = (await calendar.GetEventsAsync(day, ct)).FirstOrDefault(e => e.Id == id && e.Suggested);
            if (suggestion is null) return Results.NotFound();
            return Results.Ok(await calendar.CreateAsync(suggestion, ct));
        });
    }
}
