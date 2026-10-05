using Lifecycle.Core.Contracts;
using Lifecycle.Core.Domain;

namespace Lifecycle.Core.Services;

/// <summary>Coordinates CRM read models and validated department workflow commands.</summary>
public sealed class CrmApplicationService(
    ICrmReadStore readStore,
    IWorkflowStore workflowStore) : ICrmApplicationService
{
    /// <inheritdoc />
    public Task<DashboardResponse> GetDashboardAsync(CancellationToken cancellationToken) =>
        readStore.GetDashboardAsync(cancellationToken);

    /// <inheritdoc />
    public async Task<QueueResponse> GetQueueAsync(string department, int limit, int offset, string? search, CancellationToken cancellationToken)
    {
        if (limit is < 1 or > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), "Queue limit must be between 1 and 100.");
        }

        if (offset < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(offset), "Queue offset must be zero or greater.");
        }

        var stages = WorkflowRules.FindQueueStages(department)
            ?? throw new CrmEntityNotFoundException("Department not found.");
        return await readStore.GetQueueAsync(department, stages, limit, offset, search, cancellationToken);
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<ActivityEventResponse>> GetEventsAsync(Guid? customerId, CancellationToken cancellationToken) =>
        readStore.GetEventsAsync(customerId, cancellationToken);

    /// <inheritdoc />
    public Task<IReadOnlyList<NotificationResponse>> GetNotificationsAsync(CancellationToken cancellationToken) =>
        readStore.GetNotificationsAsync(cancellationToken);

    /// <inheritdoc />
    public async Task<CustomerResponse> GetCustomerAsync(Guid customerId, CancellationToken cancellationToken) =>
        await readStore.GetCustomerAsync(customerId, cancellationToken)
        ?? throw new CrmEntityNotFoundException("Customer not found.");

    /// <inheritdoc />
    public async Task<WorkflowActionResponse> ExecuteActionAsync(string department, WorkflowActionRequest request, CancellationToken cancellationToken)
    {
        if (request.Action == "capture_lead")
        {
            if (department != Department.Marketing)
            {
                throw new UnauthorizedWorkflowActionException("Only Marketing can capture leads.");
            }

            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email))
            {
                throw new ArgumentException("A contact name and valid email are required to capture a lead.");
            }

            var email = request.Email.Trim().ToLowerInvariant();
            if (!new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email))
            {
                throw new ArgumentException("A valid email address is required to capture a lead.");
            }

            return new WorkflowActionResponse(await workflowStore.CreateLeadAsync(
                request.Name.Trim(),
                request.Company?.Trim() ?? string.Empty,
                email,
                request.Campaign?.Trim() ?? string.Empty,
                request.EstimatedValue,
                cancellationToken));
        }

        var transition = WorkflowRules.FindTransition(request.Action)
            ?? throw new ArgumentException("Unsupported workflow action.");
        if (!string.Equals(transition.Department, department, StringComparison.Ordinal))
        {
            throw new UnauthorizedWorkflowActionException("Action is not available to this department.");
        }

        if (request.CustomerId is not Guid customerId)
        {
            throw new ArgumentException("A customerId is required for this workflow action.");
        }

        return new WorkflowActionResponse(await workflowStore.ApplyTransitionAsync(
            customerId,
            department,
            request.Action,
            transition.ToStage,
            transition.FromStages,
            request.Note,
            cancellationToken));
    }
}

/// <summary>Raised when a department attempts an action owned by another department.</summary>
public sealed class UnauthorizedWorkflowActionException(string message) : Exception(message);
