using Lifecycle.Core.Contracts;

namespace Lifecycle.Core.Services;

/// <summary>Write boundary for transactional customer intake and lifecycle state changes.</summary>
public interface IWorkflowStore
{
    /// <summary>Creates a lead and its audit and outbox records atomically.</summary>
    Task<CustomerResponse> CreateLeadAsync(string name, string company, string email, string campaign, decimal estimatedValue, CancellationToken cancellationToken);

    /// <summary>Applies a locked, state-checked lifecycle transition and writes its audit and outbox rows atomically.</summary>
    Task<CustomerResponse> ApplyTransitionAsync(Guid customerId, string department, string action, string toStage, IReadOnlyList<string> fromStages, string note, CancellationToken cancellationToken);
}
