using System.Text.Json;
using System.Globalization;
using VeloqOS.Api.Data;
using VeloqOS.Api.Integrations;
using VeloqOS.Api.Integrations.Google;
using VeloqOS.Api.Integrations.Voice;
using VeloqOS.Api.Services;
using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Endpoints;

public static class Endpoints
{
    public static WebApplication MapVeloqEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/health", () => new { status = "ok", version = "0.1.0" });

        api.MapGet("/system", (DiskCleaner disk) => new SystemInfo(disk.Disk()));

        api.MapGet("/overview", async (JobService jobs, InboxService inbox, RoutineService routines, ProjectCatalog projects, ArtifactCatalog artifacts, CancellationToken ct) =>
        {
            var routineList = routines.List();
            var projectList = projects.List();
            return new Overview(
                Projects: projectList.Count,
                ActiveProjects: projectList.Count(p => p.Tier == 3),
                RunningJobs: jobs.RunningCount(),
                InboxNeedsYou: await inbox.NeedsYouAsync(ct),
                RoutinesOn: routineList.Count(r => r.Enabled),
                RoutinesTotal: routineList.Count,
                Artifacts: artifacts.List().Count);
        });

        api.MapGet("/projects", (ProjectCatalog projects) => projects.List());

        api.MapGet("/projects/status", async (bool? refresh, ProjectCatalog projects, IRepoInspector repos, CancellationToken ct) =>
            await Task.WhenAll(projects.List().Where(p => p.RepoPath is not null)
                .Select(p => repos.InspectAsync(p, refresh ?? false, ct))));

        api.MapGet("/projects/{id}/stories", async (string id, ProjectCatalog projects, ILinearProvider linear, CancellationToken ct) =>
        {
            var project = projects.Find(id);
            if (project is null) return Results.NotFound();
            if (project.LinearTeam is null) return Invalid("id", $"{project.Name} är inte kopplat till något team i Linear.");
            var team = (await linear.TeamsAsync(ct)).FirstOrDefault(t => string.Equals(t.Key, project.LinearTeam, StringComparison.OrdinalIgnoreCase));
            if (team is null) return Results.NotFound();
            var issues = await linear.IssuesAsync(team.Id, open: true, ct);
            return Results.Ok(issues.OrderByDescending(i => i.UpdatedAt));
        });

        api.MapGet("/brief", (JobService jobs) =>
            jobs.List().FirstOrDefault(j => j.ChoreId == ChoreCatalog.MorningBrief && j.Status == JobStatus.Done) is { } job
                ? Results.Ok(new Brief(job.Result ?? "", job.FinishedAt ?? job.StartedAt, job.Id))
                : Results.NoContent());

        MapChores(api);
        MapRoutines(api);
        MapInbox(api);
        MapCalendar(api);
        MapGoogle(api);
        MapLinear(api);
        MapLinearMove(api);

        api.MapGet("/artifacts", (string? group, ArtifactCatalog artifacts) =>
            artifacts.List().Where(a => group is null || a.Group == group).OrderByDescending(a => a.UpdatedAt));

        MapVoice(api);

        return app;
    }

    private static void MapVoice(RouteGroupBuilder api)
    {
        api.MapGet("/voice", (IVoiceAgent agent, SpeechProvider speech, Microsoft.Extensions.Options.IOptions<VoiceOptions> options) => new VoiceStatus(
            agent.Name,
            agent.Name == "sample" ? null : options.Value.Model,
            new VoiceSpeechStatus(speech.CanListen ? "deepgram" : "browser", speech.CanSpeak ? "elevenlabs" : "browser"),
            speech.CanSpeak ? options.Value.ElevenLabsVoiceId : null));

        api.MapPost("/voice/turn", async (VoiceTurnRequest request, IVoiceAgent agent, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Text)) return Invalid("text", "Säg något först.");
            try
            {
                return Results.Ok(await agent.TurnAsync(request, ct));
            }
            catch (VoiceException e)
            {
                return Results.Problem(e.Message, statusCode: e.TimedOut ? StatusCodes.Status504GatewayTimeout : StatusCodes.Status502BadGateway);
            }
        });

        api.MapPost("/voice/mcp", async (HttpRequest request, VoiceMcpAccess access, VoiceMcpServer mcp, CancellationToken ct) =>
        {
            if (!access.Allows(request.Headers[VoiceMcpAccess.HeaderName])) return Results.Unauthorized();
            var call = await JsonDocument.ParseAsync(request.Body, cancellationToken: ct);
            var answer = await mcp.HandleAsync(call.RootElement, ct);
            return answer is null ? Results.Accepted() : Results.Json(answer);
        });

        api.MapPost("/voice/speak", async (SpeakRequest request, SpeechProvider speech, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Text) || VoiceText.Speakable(request.Text).Length == 0) return Invalid("text", "Det finns inget att läsa upp.");
            if (!speech.CanSpeak) return Results.Conflict(new { error = "ElevenLabs är inte konfigurerat. Sätt Voice:ElevenLabsApiKey och Voice:ElevenLabsVoiceId." });
            try
            {
                return Results.File(await speech.SpeakAsync(request.Text, ct), "audio/mpeg");
            }
            catch (SpeechException e)
            {
                return Results.Problem(e.Message, statusCode: StatusCodes.Status502BadGateway);
            }
        });

        api.MapPost("/voice/transcribe", async (HttpRequest request, SpeechProvider speech, CancellationToken ct) =>
        {
            if (!speech.CanListen) return Results.Conflict(new { error = "Deepgram är inte konfigurerat. Sätt Voice:DeepgramApiKey." });
            if (request.ContentLength is 0 or null && !request.Headers.TransferEncoding.Any()) return Invalid("audio", "Skicka ljudet som kropp.");
            if (request.ContentLength > MaxAudioBytes) return Invalid("audio", "Ljudet får vara högst 10 MB.");

            using var buffer = new MemoryStream();
            await request.Body.CopyToAsync(buffer, ct);
            if (buffer.Length == 0) return Invalid("audio", "Skicka ljudet som kropp.");
            if (buffer.Length > MaxAudioBytes) return Invalid("audio", "Ljudet får vara högst 10 MB.");
            buffer.Position = 0;
            try
            {
                return Results.Ok(new { text = await speech.TranscribeAsync(buffer, request.ContentType ?? "audio/webm", ct) });
            }
            catch (SpeechException e)
            {
                return Results.Problem(e.Message, statusCode: StatusCodes.Status502BadGateway);
            }
        }).DisableAntiforgery();
    }

    private const long MaxAudioBytes = 10 * 1024 * 1024;

    private static void MapChores(RouteGroupBuilder api)
    {
        api.MapGet("/chores", (ChoreCatalog chores) =>
            chores.List().Select(c => new { c.Id, c.Name, c.Description, c.Icon, c.Estimate, c.Kind, c.Project, c.Argument }));

        api.MapPost("/chores/{id}/run", (string id, ChoreRunRequest? request, ChoreCatalog chores, ProjectCatalog projects, JobService jobs) =>
        {
            var chore = chores.Find(id);
            if (chore is null) return Results.NotFound();

            var projectId = string.IsNullOrWhiteSpace(request?.ProjectId) ? null : request.ProjectId.Trim();
            Project? project = null;
            if (projectId is not null)
            {
                if (chore.Project == ChoreProjects.None) return Invalid("projectId", $"{chore.Name} körs inte i ett projekt.");
                project = projects.Find(projectId);
                if (project is null) return Invalid("projectId", $"Okänt projekt: {projectId}");
                if (project.RepoPath is null) return Invalid("projectId", $"{project.Name} har ingen mapp på datorn.");
            }
            else if (chore.Project == ChoreProjects.Required)
            {
                return Invalid("projectId", "Välj ett projekt först.");
            }

            var argument = chore.Argument is null || string.IsNullOrWhiteSpace(request?.Argument) ? null : request.Argument.Trim();
            var job = jobs.Start(chore, new ChoreContext(project, project?.RepoPath ?? projects.CodeHome, argument));
            return Results.Accepted($"/api/jobs/{job.Id}", job);
        });

        api.MapGet("/jobs", (JobService jobs) => jobs.List());

        api.MapPost("/jobs/{id}/confirm", (string id, JobConfirmRequest request, JobService jobs) =>
        {
            var result = jobs.Confirm(id, request.Choices ?? []);
            return result.Status switch
            {
                ConfirmStatus.Started => Results.Accepted($"/api/jobs/{result.Job!.Id}", result.Job),
                ConfirmStatus.NotFound => Results.NotFound(),
                ConfirmStatus.NotWaiting => Results.Conflict(new { error = "Jobbet väntar inte på något val." }),
                _ => Invalid("choices", "Välj minst ett av jobbets förslag."),
            };
        });
    }

    private static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    private static void MapRoutines(RouteGroupBuilder api)
    {
        api.MapGet("/routines", (RoutineService routines) => routines.List());

        api.MapPut("/routines/{id}", (string id, RoutineUpdate update, RoutineService routines) =>
            routines.SetEnabled(id, update.Enabled) is { } routine ? Results.Ok(routine) : Results.NotFound());

        api.MapPost("/routines/{id}/run", (string id, RoutineService routines, RoutineRunner runner) =>
        {
            if (routines.Find(id) is not { } routine) return Results.NotFound();
            var job = runner.Run(routine);
            return Results.Accepted($"/api/jobs/{job.Id}", job);
        });
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
        {
            try
            {
                return await inbox.UndoAsync(id, ct) is { } item ? Results.Ok(item) : Results.NotFound();
            }
            catch (InvalidOperationException e) when (e is not GoogleNotConnectedException)
            {
                return Results.Conflict(new { error = e.Message });
            }
        });

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

        api.MapPost("/calendar/connect", async (HttpContext http, ICalendarProvider calendar, IConfiguration config, CancellationToken ct) =>
        {
            var authUrl = await calendar.ConnectAsync(Redirect(http, config), ct);
            return new CalendarConnectResult(calendar.IsConnected, authUrl);
        });

        api.MapPost("/calendar/events", async (NewCalendarEvent request, ICalendarProvider calendar, CancellationToken ct) =>
        {
            var errors = new Dictionary<string, string[]>();
            if (string.IsNullOrWhiteSpace(request.Title)) errors["title"] = ["Ge händelsen en titel."];
            if (request.End <= request.Start) errors["end"] = ["Slutet måste ligga efter starten."];
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            if (!calendar.IsConnected) return Results.Conflict(new { error = "Kalendern är inte ansluten." });

            var location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
            var created = await calendar.CreateAsync(new CalendarEvent("", request.Title!.Trim(), request.Start, request.End, location, false), ct);
            return Results.Created($"/api/calendar/events/{Uri.EscapeDataString(created.Id)}", created);
        });

        api.MapPatch("/calendar/events/{id}", async (string id, CalendarMove request, ICalendarProvider calendar, CancellationToken ct) =>
        {
            if (request.End <= request.Start) return Invalid("end", "Slutet måste ligga efter starten.");
            if (!calendar.IsConnected) return Results.Conflict(new { error = "Kalendern är inte ansluten." });
            return await calendar.MoveAsync(id, request.Start, request.End, ct) is { } moved ? Results.Ok(moved) : Results.NotFound();
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

    private static void MapLinear(RouteGroupBuilder api)
    {
        api.MapGet("/linear", async (ILinearProvider linear, CancellationToken ct) =>
            new LinearStatus(linear.Configured, await linear.WorkspacesAsync(ct)));

        api.MapGet("/linear/teams", (ILinearProvider linear, CancellationToken ct) => linear.TeamsAsync(ct));

        api.MapGet("/linear/issues", async (string? teamId, bool? open, ILinearProvider linear, CancellationToken ct) =>
            string.IsNullOrWhiteSpace(teamId)
                ? Results.ValidationProblem(new Dictionary<string, string[]> { ["teamId"] = ["Välj ett team."] })
                : Results.Ok(await linear.IssuesAsync(teamId, open ?? true, ct)));

        api.MapPost("/linear/issues", async (NewLinearIssue request, ILinearProvider linear, CancellationToken ct) =>
        {
            var errors = new Dictionary<string, string[]>();
            if (string.IsNullOrWhiteSpace(request.TeamId)) errors["teamId"] = ["Välj ett team."];
            if (string.IsNullOrWhiteSpace(request.Title)) errors["title"] = ["Ge storyn en titel."];
            if (request.Priority is < 0 or > 4) errors["priority"] = ["Prioritet 0–4."];
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            var created = await linear.CreateAsync(request with { Title = request.Title!.Trim(), Description = request.Description?.Trim() }, ct);
            return Results.Created(created.Url, created);
        });
    }

    private static void MapLinearMove(RouteGroupBuilder api) =>
        api.MapPatch("/linear/issues/{id}", async (string id, LinearIssueUpdate request, ILinearProvider linear, CancellationToken ct) =>
            string.IsNullOrWhiteSpace(request.StateId)
                ? Invalid("stateId", "Välj en status.")
                : await linear.MoveAsync(id, request.StateId.Trim(), ct) is { } moved ? Results.Ok(moved) : Results.NotFound());

    private static void MapGoogle(RouteGroupBuilder api)
    {
        api.MapGet("/google", (GoogleAuth google) => new GoogleStatus(google.Configured, google.IsConnected, google.Email));

        api.MapPost("/google/connect", (HttpContext http, GoogleAuth google, IConfiguration config) =>
            google.Configured
                ? Results.Ok(new GoogleConnectResult(google.Start(Redirect(http, config))))
                : Results.Conflict(new { error = "Google är inte konfigurerat. Sätt Google:ClientId och Google:ClientSecret." }));

        api.MapGet("/google/callback", async (string? code, string? state, string? error, GoogleAuth google, CancellationToken ct) =>
        {
            if (error is not null || code is null || state is null)
                return Page("Inloggningen avbröts.", "Google skickade ingen behörighet. Gå tillbaka till Veloq OS och försök igen.");
            try
            {
                var returnTo = await google.CompleteAsync(state, code, ct);
                return returnTo is null
                    ? Page("Google är anslutet.", $"Gmail och Google Kalender{(google.Email is { } email ? $" för {email}" : "")} syns nu i Veloq OS. Du kan stänga fliken.")
                    : Results.Redirect(returnTo);
            }
            catch (Exception e) when (e is ArgumentException or GoogleApiException)
            {
                return Page("Det gick inte att ansluta.", e.Message.Split(" (Parameter")[0]);
            }
        }).ExcludeFromDescription();

        api.MapPost("/google/disconnect", async (GoogleAuth google, CancellationToken ct) =>
        {
            await google.DisconnectAsync(ct);
            return Results.NoContent();
        });
    }

    /// <summary>
    /// Google sends the browser back to this API on the loopback address (Desktop app clients accept
    /// any port), then on to the dashboard that asked, if it is a known web origin.
    /// </summary>
    internal static OAuthRedirect Redirect(HttpContext http, IConfiguration config)
    {
        var port = http.Request.Host.Port ?? (http.Request.IsHttps ? 443 : 80);
        var origin = http.Request.Headers.Origin.ToString();
        var known = config.GetSection("Veloq:WebOrigins").Get<string[]>() ?? [];
        var returnTo = origin.StartsWith("http", StringComparison.OrdinalIgnoreCase) && known.Contains(origin, StringComparer.OrdinalIgnoreCase)
            ? origin.TrimEnd('/') + "/"
            : null;
        return new OAuthRedirect($"http://127.0.0.1:{port}/api/google/callback", returnTo);
    }

    private static IResult Page(string title, string body)
    {
        var html = $$"""
            <!doctype html>
            <html lang="sv">
            <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Veloq OS</title>
            <style>
              body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d12; color: #f2f4f8;
                     font-family: "Space Grotesk", system-ui, sans-serif; }
              main { max-width: 440px; padding: 32px; border: 1px solid #262a33; border-radius: 28px; display: flex; flex-direction: column; gap: 12px; }
              small { font-family: "JetBrains Mono", ui-monospace, monospace; letter-spacing: .08em; color: #3df2c6; }
              h1 { margin: 0; font-size: 28px; letter-spacing: -.01em; }
              p { margin: 0; line-height: 1.5; color: #b8bdc8; }
            </style>
            <main><small>VELOQ OS · GOOGLE</small><h1>{{Encode(title)}}</h1><p>{{Encode(body)}}</p></main>
            </html>
            """;
        return Results.Content(html, "text/html; charset=utf-8");

        // Only the markup characters; WebUtility.HtmlEncode would turn å, ä and ö into entities.
        static string Encode(string text) => text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
    }
}
