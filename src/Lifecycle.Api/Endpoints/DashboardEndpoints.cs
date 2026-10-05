using Lifecycle.Core.Contracts;
using Lifecycle.Core.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Lifecycle.Api.Endpoints;

/// <summary>Maps executive dashboard endpoints.</summary>
public static class DashboardEndpoints
{
    /// <summary>Maps CRM portfolio aggregate endpoints.</summary>
    public static WebApplication MapDashboardEndpoints(this WebApplication app)
    {
        app.MapGet("/api/dashboard", async Task<Ok<DashboardResponse>> (
            ICrmApplicationService crm, CancellationToken cancellationToken) =>
                TypedResults.Ok(await crm.GetDashboardAsync(cancellationToken)))
            .WithName("GetDashboard")
            .WithSummary("Get lifecycle and revenue aggregates")
            .WithDescription("Returns database-aggregated lifecycle stage counts, historical funnel counts, and Census-based account receipt bands.")
            .Produces<DashboardResponse>(StatusCodes.Status200OK);
        return app;
    }
}
