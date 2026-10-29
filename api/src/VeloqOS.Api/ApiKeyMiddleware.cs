using System.Security.Cryptography;
using System.Text;

namespace VeloqOS.Api;

/// <summary>
/// Requires the header <c>X-Veloq-Key</c> on every /api call except /api/health when
/// <c>Auth:ApiKey</c> is set. An empty key turns the check off (local development only).
/// </summary>
public sealed class ApiKeyMiddleware(RequestDelegate next, IConfiguration configuration)
{
    public const string HeaderName = "X-Veloq-Key";

    public async Task InvokeAsync(HttpContext context)
    {
        var expected = configuration["Auth:ApiKey"];
        var path = context.Request.Path;
        var guarded = path.StartsWithSegments("/api") && !path.StartsWithSegments("/api/health");

        if (guarded && !string.IsNullOrEmpty(expected) && !Matches(context.Request.Headers[HeaderName], expected))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Fel eller saknad nyckel." });
            return;
        }

        await next(context);
    }

    private static bool Matches(string? given, string expected) =>
        given is not null &&
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(expected));
}
