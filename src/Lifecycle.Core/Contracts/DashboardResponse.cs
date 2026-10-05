namespace Lifecycle.Core.Contracts;

/// <summary>Aggregated portfolio and lifecycle metrics for the executive dashboard.</summary>
public sealed record DashboardResponse(
    IReadOnlyDictionary<string, int> CountByStage,
    IReadOnlyDictionary<string, int> FunnelByStage,
    int TotalCustomers,
    decimal TotalAnnualRevenue,
    decimal PipelineValue,
    IReadOnlyList<RevenueBandResponse> RevenueDistribution);

/// <summary>Customer and receipts total for one industry and annual-revenue band.</summary>
public sealed record RevenueBandResponse(string IndustryCode, string Band, int Count, decimal Revenue);
