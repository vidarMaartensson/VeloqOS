using Microsoft.AspNetCore.Diagnostics;

namespace VeloqOS.Api.Integrations.Google;

/// <summary>Turns Google failures into 409 (not signed in) and 502 (Google said no) instead of 500.</summary>
public sealed class GoogleExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        var (status, message) = exception switch
        {
            GoogleNotConnectedException e => (StatusCodes.Status409Conflict, e.Message),
            GoogleApiException e => (StatusCodes.Status502BadGateway, e.Message),
            _ => (0, ""),
        };
        if (status == 0) return false;

        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new { error = message }, cancellationToken);
        return true;
    }
}
