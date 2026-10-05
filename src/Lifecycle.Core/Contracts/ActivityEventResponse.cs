namespace Lifecycle.Core.Contracts;

/// <summary>A durable customer lifecycle audit event.</summary>
public sealed record ActivityEventResponse(
    long Id,
    Guid CustomerId,
    string CustomerName,
    string Department,
    string Action,
    string? FromStage,
    string ToStage,
    string Details,
    DateTimeOffset CreatedAt);
