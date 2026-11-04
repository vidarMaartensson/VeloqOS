using VeloqOS.Api;
using VeloqOS.Api.Endpoints;
using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations;
using VeloqOS.Api.Integrations.Claude;
using VeloqOS.Api.Integrations.Google;
using VeloqOS.Api.Integrations.Linear;
using VeloqOS.Api.Integrations.Voice;
using VeloqOS.Api.Services;
using VeloqOS.Api.Services.Chores;

var builder = WebApplication.CreateBuilder(args);

var zoneId = builder.Configuration["Veloq:TimeZone"] ?? "Europe/Stockholm";
var zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(zone);

// Google:ClientId/ClientSecret live in user-secrets, also when the API runs inside the Mac app (Production).
// Never in the tests: they would otherwise run against the developer's real Google account.
if (!builder.Environment.IsEnvironment("Testing"))
    builder.Configuration.AddUserSecrets<Program>(optional: true);
builder.Services.Configure<GoogleOptions>(builder.Configuration.GetSection("Google"));
builder.Services.AddHttpClient(GoogleAuth.HttpClientName);
builder.Services.AddSingleton<GoogleAuth>();
builder.Services.AddSingleton<GoogleClient>();

// Integrations – Google when it is configured, otherwise the Sample/Echo implementations.
static bool UseGoogle(IServiceProvider sp) => sp.GetRequiredService<IOptions<GoogleOptions>>().Value.Configured;

// Claude Code on this Mac when it is installed, so chats run on the signed-in subscription.
builder.Services.Configure<ClaudeOptions>(builder.Configuration.GetSection("Claude"));
builder.Services.AddSingleton<ICommandRunner, ProcessCommandRunner>();
builder.Services.AddSingleton<IAgent>(sp => sp.GetRequiredService<IOptions<ClaudeOptions>>().Value.ResolvedCommand is not null
    ? ActivatorUtilities.CreateInstance<ClaudeCodeAgent>(sp)
    : new EchoAgent());
builder.Services.AddSingleton<IInboxProvider>(sp => UseGoogle(sp)
    ? ActivatorUtilities.CreateInstance<GmailInboxProvider>(sp)
    : ActivatorUtilities.CreateInstance<SampleInboxProvider>(sp));
builder.Services.AddSingleton<ICalendarProvider>(sp => UseGoogle(sp)
    ? ActivatorUtilities.CreateInstance<GoogleCalendarProvider>(sp)
    : new SampleCalendarProvider(sp.GetRequiredService<TimeZoneInfo>()));

builder.Services.AddSingleton<ProjectCatalog>();
// Linear:ApiKey (a personal API key, in user-secrets) picks the real workspace; without it, sample stories.
builder.Services.Configure<LinearOptions>(builder.Configuration.GetSection("Linear"));
builder.Services.AddHttpClient(LinearProvider.HttpClientName);
builder.Services.AddSingleton<ILinearProvider>(sp => sp.GetRequiredService<IOptions<LinearOptions>>().Value.Configured
    ? ActivatorUtilities.CreateInstance<LinearProvider>(sp)
    : ActivatorUtilities.CreateInstance<SampleLinearProvider>(sp));

// The voice: Claude API with tools when Voice:AnthropicApiKey is set, otherwise Claude Code on the subscription, otherwise the keyword sample.
// ElevenLabs and Deepgram each when their key is set; the dashboard falls back to the browser's speech.
builder.Services.Configure<VoiceOptions>(builder.Configuration.GetSection("Voice"));
builder.Services.AddHttpClient(ClaudeVoiceAgent.HttpClientName, c => c.Timeout = TimeSpan.FromSeconds(60));
builder.Services.AddHttpClient(SpeechProvider.HttpClientName, c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddSingleton<VoiceToolbox>();
builder.Services.AddSingleton<SpeechProvider>();
builder.Services.AddSingleton<ILiveProcessStarter, LiveProcessStarter>();
builder.Services.AddSingleton<VoiceTurnRecorder>();
builder.Services.AddSingleton<VoiceMcpAccess>();
builder.Services.AddSingleton<VoiceMcpServer>();
builder.Services.AddSingleton<IVoiceAgent>(sp =>
{
    if (sp.GetRequiredService<IOptions<VoiceOptions>>().Value.UseClaude) return ActivatorUtilities.CreateInstance<ClaudeVoiceAgent>(sp);
    return sp.GetRequiredService<IOptions<ClaudeOptions>>().Value.ResolvedCommand is not null
        ? ActivatorUtilities.CreateInstance<ClaudeCodeVoiceAgent>(sp)
        : ActivatorUtilities.CreateInstance<SampleVoiceAgent>(sp);
});
builder.Services.AddHostedService<VoiceKeepAlive>();

// Chores: the first handler that takes a chore runs it, so Claude Code (which takes all) goes last.
builder.Services.AddSingleton<ChoreCatalog>();
builder.Services.AddSingleton<DiskCleaner>();
builder.Services.AddSingleton<IChoreHandler, DiskCleanupHandler>();
builder.Services.AddSingleton<IChoreHandler, InboxChoreHandler>();
builder.Services.AddSingleton<IChoreHandler, BriefHandler>();
builder.Services.AddSingleton<IChoreHandler, ArtifactSyncHandler>();
builder.Services.AddSingleton<IChoreHandler, ClaudeChoreHandler>();
builder.Services.AddSingleton<JobService>();
builder.Services.AddSingleton<InboxService>();
builder.Services.AddSingleton<RoutineService>();
builder.Services.AddSingleton<RoutineRunner>();
builder.Services.AddSingleton<ArtifactCatalog>();
// git and gh in each repo; gh keeps its own GitHub login.
builder.Services.AddSingleton<IRepoInspector>(sp => new RepoInspector(
    sp.GetRequiredService<ICommandRunner>(), sp.GetRequiredService<TimeProvider>(), RepoInspector.FindGh()));
// Routines run on their schedule – not in the tests, which start them by hand.
if (builder.Configuration.GetValue("Veloq:RunRoutines", !builder.Environment.IsEnvironment("Testing")))
    builder.Services.AddHostedService<RoutineScheduler>();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GoogleExceptionHandler>();
builder.Services.AddExceptionHandler<LinearExceptionHandler>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(builder.Configuration.GetSection("Veloq:WebOrigins").Get<string[]>() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

// New Google sign-in (or sign-out) → the cached inbox is stale.
app.Services.GetRequiredService<GoogleAuth>().Changed += app.Services.GetRequiredService<InboxService>().Invalidate;

app.UseExceptionHandler();
app.UseCors();
app.UseMiddleware<ApiKeyMiddleware>();
app.MapVeloqEndpoints();

app.Run();

/// <summary>Exposed for WebApplicationFactory in the tests.</summary>
public partial class Program;
