using Lifecycle.Core.Contracts;
using Lifecycle.Core.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Lifecycle.Api.Endpoints;

/// <summary>Maps automation handoff notification endpoints.</summary>
public static class NotificationEndpoints
{
    /// <summary>Maps the latest durable department notifications.</summary>
    public static WebApplication MapNotificationEndpoints(this WebApplication app)
    {
        app.MapGet("/api/notifications", async Task<Ok<NotificationsResponse>> (
            ICrmApplicationService crm, CancellationToken cancellationToken) =>
            TypedResults.Ok(new NotificationsResponse(await crm.GetNotificationsAsync(cancellationToken))))
            .WithName("GetHandoffNotifications")
            .WithSummary("Get recent department handoffs")
            .WithDescription("Returns handoff notifications persisted by the independent transactional-outbox worker.")
            .Produces<NotificationsResponse>(StatusCodes.Status200OK);
        return app;
    }
}
