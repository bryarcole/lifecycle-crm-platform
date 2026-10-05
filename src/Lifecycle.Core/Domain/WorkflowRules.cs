namespace Lifecycle.Core.Domain;

/// <summary>Defines the allowed lifecycle commands and department queue projections.</summary>
public static class WorkflowRules
{
    private static readonly IReadOnlyDictionary<string, Transition> Transitions =
        new Dictionary<string, Transition>(StringComparer.Ordinal)
        {
            ["engage_lead"] = new(Department.Marketing, [LifecycleStage.NewLead], LifecycleStage.WarmLead),
            ["qualify"] = new(Department.InsideSales, [LifecycleStage.WarmLead], LifecycleStage.Qualified),
            ["disqualify"] = new(Department.InsideSales, [LifecycleStage.WarmLead, LifecycleStage.Qualified], LifecycleStage.ClosedLost),
            ["close_won"] = new(Department.Sales, [LifecycleStage.Qualified], LifecycleStage.ClosedWon),
            ["close_lost"] = new(Department.Sales, [LifecycleStage.Qualified], LifecycleStage.ClosedLost),
            ["create_order"] = new(Department.Ordering, [LifecycleStage.ClosedWon, LifecycleStage.RenewalDue], LifecycleStage.AwaitingDelivery),
            ["mark_delivered"] = new(Department.Delivery, [LifecycleStage.AwaitingDelivery], LifecycleStage.ActiveCustomer),
            ["start_renewal"] = new(Department.Retention, [LifecycleStage.ActiveCustomer], LifecycleStage.RenewalDue),
            ["cross_sell"] = new(Department.Retention, [LifecycleStage.ActiveCustomer], LifecycleStage.NewLead),
        };

    private static readonly IReadOnlyDictionary<string, string[]> Queues =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            [Department.Marketing] = [LifecycleStage.NewLead],
            [Department.InsideSales] = [LifecycleStage.WarmLead],
            [Department.Sales] = [LifecycleStage.Qualified],
            [Department.Ordering] = [LifecycleStage.ClosedWon, LifecycleStage.RenewalDue],
            [Department.Delivery] = [LifecycleStage.AwaitingDelivery],
            [Department.Retention] = [LifecycleStage.ActiveCustomer],
        };

    /// <summary>Returns the allowed transition for an action, if it exists.</summary>
    public static Transition? FindTransition(string action) =>
        Transitions.TryGetValue(action, out var transition) ? transition : null;

    /// <summary>Returns the queue stages for a department, or null for an unknown department.</summary>
    public static IReadOnlyList<string>? FindQueueStages(string department) =>
        Queues.TryGetValue(department, out var stages) ? stages : null;

    /// <summary>Describes a department command, its permitted source stages, and its destination.</summary>
    public sealed record Transition(string Department, IReadOnlyList<string> FromStages, string ToStage);
}
