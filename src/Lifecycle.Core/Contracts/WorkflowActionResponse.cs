namespace Lifecycle.Core.Contracts;

/// <summary>The CRM profile returned after a create or lifecycle action.</summary>
public sealed record WorkflowActionResponse(CustomerResponse Customer);
