namespace Lifecycle.Core.Domain;

/// <summary>Department names accepted in API routes and durable handoff notifications.</summary>
public static class Department
{
    public const string Marketing = "marketing";
    public const string InsideSales = "inside-sales";
    public const string Sales = "sales";
    public const string Ordering = "ordering";
    public const string Delivery = "delivery";
    public const string Retention = "retention";

    public static IReadOnlyList<string> All { get; } =
    [Marketing, InsideSales, Sales, Ordering, Delivery, Retention];
}
