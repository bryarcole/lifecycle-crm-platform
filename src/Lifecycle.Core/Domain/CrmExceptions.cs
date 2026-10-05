namespace Lifecycle.Core.Domain;

/// <summary>Raised when a requested CRM entity does not exist.</summary>
public sealed class CrmEntityNotFoundException(string message) : Exception(message);

/// <summary>Raised when a lifecycle action conflicts with the customer's current state.</summary>
public sealed class LifecycleConflictException(string message) : Exception(message);
