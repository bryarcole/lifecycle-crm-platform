using Lifecycle.Core.Contracts;

namespace Lifecycle.Core.Services;

/// <summary>Read-only persistence boundary for CRM profiles, queues, analytics, and audit history.</summary>
public interface ICrmReadStore
{
    /// <summary>Returns bounded portfolio metrics and receipt-size aggregates.</summary>
    Task<DashboardResponse> GetDashboardAsync(CancellationToken cancellationToken);

    /// <summary>Returns one page of customers waiting in a department queue.</summary>
    Task<QueueResponse> GetQueueAsync(string department, IReadOnlyList<string> stages, int limit, int offset, string? search, CancellationToken cancellationToken);

    /// <summary>Returns the newest lifecycle events, optionally scoped to one customer.</summary>
    Task<IReadOnlyList<ActivityEventResponse>> GetEventsAsync(Guid? customerId, CancellationToken cancellationToken);

    /// <summary>Returns the newest durable department handoff notifications.</summary>
    Task<IReadOnlyList<NotificationResponse>> GetNotificationsAsync(CancellationToken cancellationToken);

    /// <summary>Returns one customer profile by identifier.</summary>
    Task<CustomerResponse?> GetCustomerAsync(Guid customerId, CancellationToken cancellationToken);
}
