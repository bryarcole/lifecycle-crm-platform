namespace Lifecycle.Core.Contracts;

/// <summary>A bounded page of recent customer lifecycle audit events.</summary>
public sealed record ActivityEventsResponse(IReadOnlyList<ActivityEventResponse> Events);
