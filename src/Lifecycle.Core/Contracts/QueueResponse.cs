namespace Lifecycle.Core.Contracts;

/// <summary>A bounded, searchable department queue page.</summary>
public sealed record QueueResponse(string Department, IReadOnlyList<CustomerResponse> Customers, int Total, int Limit, int Offset);
