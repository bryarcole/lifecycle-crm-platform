using Lifecycle.Api.Endpoints;
using Lifecycle.Core.Domain;
using Lifecycle.Core.Services;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Lifecycle.Api.Middleware;

/// <summary>Maps safe domain and validation failures to RFC 7807 problem responses.</summary>
public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    /// <inheritdoc />
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, title, detail) = exception switch
        {
            CrmEntityNotFoundException => (StatusCodes.Status404NotFound, "Not Found", "The requested CRM resource was not found."),
            LifecycleConflictException => (StatusCodes.Status409Conflict, "Lifecycle conflict", exception.Message),
            UnauthorizedWorkflowActionException => (StatusCodes.Status403Forbidden, "Action not allowed", exception.Message),
            ArgumentOutOfRangeException or ArgumentException => (StatusCodes.Status400BadRequest, "Invalid request", exception.Message),
            PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } =>
                (StatusCodes.Status409Conflict, "Conflict", "A customer with this email already exists."),
            _ => (0, string.Empty, string.Empty),
        };

        if (status == 0) return false;
        logger.LogInformation(exception, "Handled CRM request error {StatusCode}: {Title}", status, title);
        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Instance = httpContext.Request.Path,
        }, cancellationToken);
        return true;
    }
}
