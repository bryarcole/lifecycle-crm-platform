namespace Lifecycle.Core.Services;

/// <summary>Persistence boundary used by API initialization and the independent automation worker.</summary>
public interface IOutboxStore
{
    /// <summary>Creates the demo schema and inserts walkthrough profiles when the database is empty.</summary>
    Task InitializeAsync(CancellationToken cancellationToken);

    /// <summary>Processes a bounded set of pending outbox messages and writes notifications idempotently.</summary>
    Task<int> ProcessOutboxBatchAsync(int batchSize, CancellationToken cancellationToken);
}
