using Lifecycle.Core.Contracts;

namespace Lifecycle.Core.Services;

/// <summary>Application boundary used by HTTP endpoints to coordinate CRM reads and workflow commands.</summary>
public interface ICrmApplicationService
{
    /// <summary>Gets portfolio dashboard aggregates.</summary>
    Task<DashboardResponse> GetDashboardAsync(CancellationToken cancellationToken);

    /// <summary>Gets one department's paginated customer queue.</summary>
    Task<QueueResponse> GetQueueAsync(string department, int limit, int offset, string? search, CancellationToken cancellationToken);

    /// <summary>Gets recent lifecycle events for the system or one customer.</summary>
    Task<IReadOnlyList<ActivityEventResponse>> GetEventsAsync(Guid? customerId, CancellationToken cancellationToken);

    /// <summary>Gets recent automation handoff notifications.</summary>
    Task<IReadOnlyList<NotificationResponse>> GetNotificationsAsync(CancellationToken cancellationToken);

    /// <summary>Gets one customer profile.</summary>
    Task<CustomerResponse> GetCustomerAsync(Guid customerId, CancellationToken cancellationToken);

    /// <summary>Runs a department-authorized workflow action.</summary>
    Task<WorkflowActionResponse> ExecuteActionAsync(string department, WorkflowActionRequest request, CancellationToken cancellationToken);
}
