using Lifecycle.Core.Services;

namespace Lifecycle.Worker;

/// <summary>Consumes CRM outbox messages and persists idempotent handoff notifications.</summary>
public sealed class OutboxWorker(IServiceScopeFactory scopeFactory, ILogger<OutboxWorker> logger) : BackgroundService
{
    private const int BatchSize = 100;
    private static readonly TimeSpan IdleDelay = TimeSpan.FromMilliseconds(500);
    private static readonly TimeSpan ErrorDelay = TimeSpan.FromSeconds(2);

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Lifecycle outbox worker started.");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var repository = scope.ServiceProvider.GetRequiredService<IOutboxStore>();
                var processed = await repository.ProcessOutboxBatchAsync(BatchSize, stoppingToken);
                if (processed == 0) await Task.Delay(IdleDelay, stoppingToken);
                else logger.LogDebug("Processed {MessageCount} lifecycle outbox messages.", processed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Lifecycle outbox batch failed; the messages remain available for retry.");
                await Task.Delay(ErrorDelay, stoppingToken);
            }
        }
        logger.LogInformation("Lifecycle outbox worker stopped.");
    }
}
