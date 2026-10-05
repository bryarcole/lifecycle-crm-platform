namespace Lifecycle.Core.Contracts;

/// <summary>A bounded page of recent workflow handoff notifications.</summary>
public sealed record NotificationsResponse(IReadOnlyList<NotificationResponse> Notifications);
