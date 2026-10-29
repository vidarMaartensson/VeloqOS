using VeloqOS.Api;
using VeloqOS.Api.Endpoints;
using VeloqOS.Api.Integrations;
using VeloqOS.Api.Services;

var builder = WebApplication.CreateBuilder(args);

var zoneId = builder.Configuration["Veloq:TimeZone"] ?? "Europe/Stockholm";
var zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(zone);

// Integrations – swap the Sample/Echo implementations for real ones here.
builder.Services.AddSingleton<IAgent, EchoAgent>();
builder.Services.AddSingleton<IInboxProvider, SampleInboxProvider>();
builder.Services.AddSingleton<ICalendarProvider>(sp => new SampleCalendarProvider(sp.GetRequiredService<TimeZoneInfo>()));

builder.Services.AddSingleton<JobService>();
builder.Services.AddSingleton<InboxService>();
builder.Services.AddSingleton<RoutineService>();

builder.Services.AddProblemDetails();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(builder.Configuration.GetSection("Veloq:WebOrigins").Get<string[]>() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors();
app.UseMiddleware<ApiKeyMiddleware>();
app.MapVeloqEndpoints();

app.Run();

/// <summary>Exposed for WebApplicationFactory in the tests.</summary>
public partial class Program;
