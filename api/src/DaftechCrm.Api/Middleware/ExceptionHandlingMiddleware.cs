using System.Net;
using System.Text.Json;

namespace DaftechCrm.Api.Middleware;

/// <summary>
/// Catches any exception that escapes a controller action and turns it
/// into a consistent JSON error response instead of leaking a stack trace.
/// Controllers still catch specific InvalidOperationException /
/// ArgumentOutOfRangeException cases themselves for precise 400/404/409
/// responses (see e.g. TicketsController) — this is the last-resort net
/// for anything unhandled.
/// </summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception processing {Method} {Path}", context.Request.Method, context.Request.Path);

            if (context.Response.HasStarted)
                throw;

            context.Response.ContentType = "application/json";
            context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;

            var payload = new
            {
                error = "An unexpected error occurred. Please try again, and contact support if the problem persists.",
                traceId = context.TraceIdentifier,
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(payload));
        }
    }
}
