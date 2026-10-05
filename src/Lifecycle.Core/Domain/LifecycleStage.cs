namespace Lifecycle.Core.Domain;

/// <summary>Stable lifecycle stage names shared by the CRM, workflow UI, and automation worker.</summary>
public static class LifecycleStage
{
    public const string NewLead = "new_lead";
    public const string WarmLead = "warm_lead";
    public const string Qualified = "qualified";
    public const string ClosedWon = "closed_won";
    public const string ClosedLost = "closed_lost";
    public const string RenewalDue = "renewal_due";
    public const string AwaitingDelivery = "awaiting_delivery";
    public const string ActiveCustomer = "active_customer";

    public static IReadOnlyList<string> DashboardStages { get; } =
    [NewLead, WarmLead, Qualified, ClosedWon, ClosedLost, RenewalDue, AwaitingDelivery, ActiveCustomer];
}
