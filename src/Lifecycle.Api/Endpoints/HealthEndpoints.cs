using Microsoft.AspNetCore.Http.HttpResults;

namespace Lifecycle.Api.Endpoints;

/// <summary>Maps service health endpoints.</summary>
public static class HealthEndpoints
{
    /// <summary>Maps the liveness probe used by local Compose and cloud container platforms.</summary>
    public static WebApplication MapHealthEndpoints(this WebApplication app)
    {
        app.MapGet("/health", () => TypedResults.Ok(new HealthResponse("ok", "crm-api")))
            .WithName("GetCrmHealth")
            .WithSummary("Check CRM API liveness")
            .WithDescription("Returns a small liveness response for container and load-balancer probes.")
            .Produces<HealthResponse>(StatusCodes.Status200OK);
        return app;
    }

    /// <summary>Public health response for a backend service.</summary>
    public sealed record HealthResponse(string Status, string Service);
}
