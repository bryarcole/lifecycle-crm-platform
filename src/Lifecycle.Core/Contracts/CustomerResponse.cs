namespace Lifecycle.Core.Contracts;

/// <summary>Public customer fields used by department queue pages.</summary>
public sealed record CustomerResponse(
    Guid Id,
    string Name,
    string Company,
    string Email,
    string LifecycleStage,
    string Campaign,
    decimal EstimatedValue,
    decimal AnnualRevenue,
    string IndustryCode,
    DateTimeOffset UpdatedAt);
