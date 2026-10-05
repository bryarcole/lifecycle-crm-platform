using System.ComponentModel.DataAnnotations;

namespace Lifecycle.Core.Contracts;

/// <summary>Payload for capturing a new marketing lead in the CRM.</summary>
public sealed record CreateLeadRequest
{
    /// <summary>Contact display name.</summary>
    [Required, StringLength(160, MinimumLength = 1)]
    public required string Name { get; init; }

    /// <summary>Customer organization name.</summary>
    [StringLength(200)]
    public string Company { get; init; } = string.Empty;

    /// <summary>Unique contact email address.</summary>
    [Required, EmailAddress, StringLength(254)]
    public required string Email { get; init; }

    /// <summary>Marketing attribution label.</summary>
    [StringLength(160)]
    public string Campaign { get; init; } = string.Empty;

    /// <summary>Estimated value of the opportunity, in USD.</summary>
    [Range(typeof(decimal), "0", "999999999999.99")]
    public decimal EstimatedValue { get; init; }
}
