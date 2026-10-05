using Lifecycle.Core.Contracts;
using Lifecycle.Core.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Lifecycle.Api.Endpoints;

/// <summary>Maps lifecycle audit history endpoints.</summary>
public static class ActivityEndpoints
{
    /// <summary>Maps the bounded activity feed and optional customer history filter.</summary>
    public static WebApplication MapActivityEndpoints(this WebApplication app)
    {
        app.MapGet("/api/events", async Task<Ok<ActivityEventsResponse>> (
            Guid? customerId, ICrmApplicationService crm, CancellationToken cancellationToken) =>
            TypedResults.Ok(new ActivityEventsResponse(await crm.GetEventsAsync(customerId, cancellationToken))))
            .WithName("GetLifecycleEvents")
            .WithSummary("Get recent lifecycle events")
            .WithDescription("Returns the newest 100 audit events, or just one customer's history when customerId is supplied.")
            .Produces<ActivityEventsResponse>(StatusCodes.Status200OK);
        return app;
    }
}
