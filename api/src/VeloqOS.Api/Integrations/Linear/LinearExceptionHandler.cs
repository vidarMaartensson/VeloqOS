using Microsoft.AspNetCore.Diagnostics;

namespace VeloqOS.Api.Integrations.Linear;

/// <summary>Turns Linear failures into 502 (Linear said no) and 404 (no such team) instead of 500.</summary>
public sealed class LinearExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        var status = exception switch
        {
            LinearApiException => StatusCodes.Status502BadGateway,
            LinearTeamNotFoundException => StatusCodes.Status404NotFound,
            _ => 0,
        };
        if (status == 0) return false;
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new { error = exception.Message }, cancellationToken);
        return true;
    }
}
