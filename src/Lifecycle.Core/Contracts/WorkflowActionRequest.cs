using System.ComponentModel.DataAnnotations;

namespace Lifecycle.Core.Contracts;

/// <summary>Payload for a department-owned lifecycle command.</summary>
public sealed record WorkflowActionRequest
{
    /// <summary>Registered workflow command such as qualify, close_won, or mark_delivered.</summary>
    [Required, StringLength(48, MinimumLength = 1)]
    public required string Action { get; init; }

    /// <summary>Customer profile targeted by this workflow command.</summary>
    public Guid? CustomerId { get; init; }

    /// <summary>Optional note recorded with the lifecycle event.</summary>
    [StringLength(1000)]
    public string Note { get; init; } = string.Empty;

    /// <summary>Contact display name, required only when action is capture_lead.</summary>
    [StringLength(160)]
    public string? Name { get; init; }

    /// <summary>Organization name, accepted only when action is capture_lead.</summary>
    [StringLength(200)]
    public string? Company { get; init; }

    /// <summary>Email address, required only when action is capture_lead.</summary>
    [EmailAddress, StringLength(254)]
    public string? Email { get; init; }

    /// <summary>Campaign attribution, accepted only when action is capture_lead.</summary>
    [StringLength(160)]
    public string? Campaign { get; init; }

    /// <summary>Estimated opportunity value in USD, accepted only when action is capture_lead.</summary>
    [Range(typeof(decimal), "0", "9999999999.99")]
    public decimal EstimatedValue { get; init; }
}
