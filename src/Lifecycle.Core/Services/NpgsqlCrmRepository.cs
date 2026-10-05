using System.Reflection;
using System.Text.Json;
using Lifecycle.Core.Contracts;
using Lifecycle.Core.Domain;
using Npgsql;
using NpgsqlTypes;

namespace Lifecycle.Core.Services;

/// <summary>PostgreSQL implementation of the CRM persistence boundary.</summary>
public sealed partial class NpgsqlCrmRepository(NpgsqlDataSource dataSource) : ICrmReadStore, IWorkflowStore, IOutboxStore
{
    private const string CustomerSelect = """
        id, name, company, email, lifecycle_stage, campaign, estimated_value,
        annual_revenue, industry_code, updated_at
        """;

    /// <inheritdoc />
    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        await using var resource = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Lifecycle.Core.Database.schema.sql")
            ?? throw new InvalidOperationException("The PostgreSQL schema resource is missing.");
        using var reader = new StreamReader(resource);
        var schema = await reader.ReadToEndAsync(cancellationToken);
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using (var schemaCommand = new NpgsqlCommand(schema, connection))
        {
            await schemaCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await SeedWalkthroughProfilesAsync(connection, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<DashboardResponse> GetDashboardAsync(CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var countByStage = new Dictionary<string, int>(StringComparer.Ordinal);
        decimal totalAnnualRevenue = 0;
        decimal pipelineValue = 0;
        const string currentSql = """
            SELECT lifecycle_stage, COUNT(*)::int,
                   COALESCE(SUM(annual_revenue), 0),
                   COALESCE(SUM(estimated_value) FILTER (
                       WHERE lifecycle_stage IN ('closed_won', 'awaiting_delivery', 'active_customer', 'renewal_due')
                   ), 0)
            FROM customers
            GROUP BY lifecycle_stage
            """;
        await using (var command = new NpgsqlCommand(currentSql, connection))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                countByStage[reader.GetString(0)] = reader.GetInt32(1);
                totalAnnualRevenue += reader.GetDecimal(2);
                pipelineValue += reader.GetDecimal(3);
            }
        }

        var funnelByStage = new Dictionary<string, int>(StringComparer.Ordinal);
        const string funnelSql = """
            SELECT stages.stage, COUNT(DISTINCT customers.id)::int
            FROM unnest(@stages::text[]) AS stages(stage)
            LEFT JOIN customers ON customers.lifecycle_stage = stages.stage
                OR EXISTS (
                    SELECT 1 FROM lifecycle_events
                    WHERE lifecycle_events.customer_id = customers.id
                      AND lifecycle_events.to_stage = stages.stage
                )
            GROUP BY stages.stage
            """;
        await using (var command = new NpgsqlCommand(funnelSql, connection))
        {
            command.Parameters.AddWithValue("stages", LifecycleStage.DashboardStages.ToArray());
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                funnelByStage[reader.GetString(0)] = reader.GetInt32(1);
            }
        }

        var revenueDistribution = new List<RevenueBandResponse>();
        const string revenueSql = """
            SELECT industry_code,
                CASE
                    WHEN annual_revenue < 1000000 THEN 'Under $1M'
                    WHEN annual_revenue < 5000000 THEN '$1M–$4.99M'
                    WHEN annual_revenue < 10000000 THEN '$5M–$9.99M'
                    WHEN annual_revenue < 25000000 THEN '$10M–$24.99M'
                    WHEN annual_revenue < 100000000 THEN '$25M–$99.99M'
                    ELSE '$100M+'
                END AS band,
                COUNT(*)::int, COALESCE(SUM(annual_revenue), 0)
            FROM customers
            GROUP BY industry_code, band
            ORDER BY industry_code, MIN(annual_revenue)
            """;
        await using (var command = new NpgsqlCommand(revenueSql, connection))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                revenueDistribution.Add(new RevenueBandResponse(
                    reader.GetString(0), reader.GetString(1), reader.GetInt32(2), reader.GetDecimal(3)));
            }
        }

        var totalCustomers = countByStage.Values.Sum();
        var completeCounts = LifecycleStage.DashboardStages.ToDictionary(
            stage => stage,
            stage => countByStage.GetValueOrDefault(stage),
            StringComparer.Ordinal);
        var completeFunnel = LifecycleStage.DashboardStages.ToDictionary(
            stage => stage,
            stage => funnelByStage.GetValueOrDefault(stage),
            StringComparer.Ordinal);
        return new DashboardResponse(
            completeCounts, completeFunnel, totalCustomers, totalAnnualRevenue, pipelineValue, revenueDistribution);
    }

    /// <inheritdoc />
    public async Task<QueueResponse> GetQueueAsync(
        string department, IReadOnlyList<string> stages, int limit, int offset, string? search, CancellationToken cancellationToken)
    {
        var escapedSearch = string.IsNullOrWhiteSpace(search)
            ? null
            : $"%{search.Trim()[..Math.Min(search.Trim().Length, 100)].Replace("\\", "\\\\", StringComparison.Ordinal).Replace("%", "\\%", StringComparison.Ordinal).Replace("_", "\\_", StringComparison.Ordinal)}%";
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var customers = new List<CustomerResponse>(limit);
        const string pageSql = """
            SELECT id, name, company, email, lifecycle_stage, campaign, estimated_value,
                   annual_revenue, industry_code, updated_at
            FROM customers
            WHERE lifecycle_stage = ANY(@stages)
              AND (@search IS NULL OR name ILIKE @search ESCAPE '\' OR company ILIKE @search ESCAPE '\' OR email ILIKE @search ESCAPE '\')
            ORDER BY updated_at, id
            LIMIT @limit OFFSET @offset
            """;
        await using (var command = new NpgsqlCommand(pageSql, connection))
        {
            command.Parameters.AddWithValue("stages", stages.ToArray());
            command.Parameters.AddWithValue("search", NpgsqlDbType.Text, (object?)escapedSearch ?? DBNull.Value);
            command.Parameters.AddWithValue("limit", limit);
            command.Parameters.AddWithValue("offset", offset);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) customers.Add(ReadCustomer(reader));
        }

        const string countSql = """
            SELECT COUNT(*)::int
            FROM customers
            WHERE lifecycle_stage = ANY(@stages)
              AND (@search IS NULL OR name ILIKE @search ESCAPE '\' OR company ILIKE @search ESCAPE '\' OR email ILIKE @search ESCAPE '\')
            """;
        await using var countCommand = new NpgsqlCommand(countSql, connection);
        countCommand.Parameters.AddWithValue("stages", stages.ToArray());
        countCommand.Parameters.AddWithValue("search", NpgsqlDbType.Text, (object?)escapedSearch ?? DBNull.Value);
        var total = (int)(await countCommand.ExecuteScalarAsync(cancellationToken) ?? 0);
        return new QueueResponse(department, customers, total, limit, offset);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<ActivityEventResponse>> GetEventsAsync(Guid? customerId, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT events.id, events.customer_id, customers.name, events.department, events.action,
                   events.from_stage, events.to_stage, events.details::text, events.created_at
            FROM lifecycle_events AS events
            JOIN customers ON customers.id = events.customer_id
            WHERE (@customerId IS NULL OR events.customer_id = @customerId)
            ORDER BY events.created_at DESC, events.id DESC
            LIMIT 100
            """;
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("customerId", NpgsqlDbType.Uuid, (object?)customerId ?? DBNull.Value);
        var events = new List<ActivityEventResponse>(100);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            events.Add(new ActivityEventResponse(
                reader.GetInt64(0), reader.GetGuid(1), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.IsDBNull(5) ? null : reader.GetString(5), reader.GetString(6),
                reader.GetString(7), reader.GetFieldValue<DateTimeOffset>(8)));
        }
        return events;
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<NotificationResponse>> GetNotificationsAsync(CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT notifications.event_id, notifications.customer_id, customers.name,
                   notifications.target_department, notifications.message, notifications.created_at, notifications.read_at
            FROM automation_notifications AS notifications
            JOIN customers ON customers.id = notifications.customer_id
            ORDER BY notifications.created_at DESC, notifications.event_id DESC
            LIMIT 30
            """;
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var notifications = new List<NotificationResponse>(30);
        while (await reader.ReadAsync(cancellationToken))
        {
            notifications.Add(new NotificationResponse(
                reader.GetInt64(0), reader.GetGuid(1), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.GetFieldValue<DateTimeOffset>(5),
                reader.IsDBNull(6) ? null : reader.GetFieldValue<DateTimeOffset>(6)));
        }
        return notifications;
    }

    /// <inheritdoc />
    public async Task<CustomerResponse?> GetCustomerAsync(Guid customerId, CancellationToken cancellationToken)
    {
        var sql = $"SELECT {CustomerSelect} FROM customers WHERE id = @id";
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", customerId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadCustomer(reader) : null;
    }

    /// <inheritdoc />
    public async Task<CustomerResponse> CreateLeadAsync(
        string name, string company, string email, string campaign, decimal estimatedValue, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        const string insertCustomer = """
            INSERT INTO customers (name, company, email, lifecycle_stage, campaign, estimated_value)
            VALUES (@name, @company, @email, @stage, @campaign, @estimatedValue)
            RETURNING id, name, company, email, lifecycle_stage, campaign, estimated_value,
                      annual_revenue, industry_code, updated_at
            """;
        await using var command = new NpgsqlCommand(insertCustomer, connection, transaction);
        command.Parameters.AddWithValue("name", name);
        command.Parameters.AddWithValue("company", company);
        command.Parameters.AddWithValue("email", email);
        command.Parameters.AddWithValue("stage", LifecycleStage.NewLead);
        command.Parameters.AddWithValue("campaign", campaign);
        command.Parameters.AddWithValue("estimatedValue", estimatedValue);
        CustomerResponse customer;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            await reader.ReadAsync(cancellationToken);
            customer = ReadCustomer(reader);
        }
        var eventId = await InsertEventAsync(connection, transaction, customer.Id, Department.Marketing,
            "capture_lead", null, LifecycleStage.NewLead, new { campaign }, cancellationToken);
        await InsertOutboxAsync(connection, transaction, eventId, customer, "capture_lead", cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return customer;
    }

    /// <inheritdoc />
    public async Task<CustomerResponse> ApplyTransitionAsync(
        Guid customerId, string department, string action, string toStage,
        IReadOnlyList<string> fromStages, string note, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        CustomerResponse current;
        const string lockSql = """
            SELECT id, name, company, email, lifecycle_stage, campaign, estimated_value,
                   annual_revenue, industry_code, updated_at
            FROM customers WHERE id = @id FOR UPDATE
            """;
        await using (var command = new NpgsqlCommand(lockSql, connection, transaction))
        {
            command.Parameters.AddWithValue("id", customerId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) throw new CrmEntityNotFoundException("Customer not found.");
            current = ReadCustomer(reader);
        }

        if (!fromStages.Contains(current.LifecycleStage, StringComparer.Ordinal))
        {
            throw new LifecycleConflictException($"Cannot perform {action} while customer is {current.LifecycleStage}.");
        }

        await using (var update = new NpgsqlCommand(
            "UPDATE customers SET lifecycle_stage = @stage, updated_at = NOW() WHERE id = @id", connection, transaction))
        {
            update.Parameters.AddWithValue("stage", toStage);
            update.Parameters.AddWithValue("id", customerId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        if (action == "create_order")
        {
            await using var createOrder = new NpgsqlCommand(
                "INSERT INTO orders (customer_id, status, amount) VALUES (@id, 'in_fulfillment', @amount)", connection, transaction);
            createOrder.Parameters.AddWithValue("id", customerId);
            createOrder.Parameters.AddWithValue("amount", current.EstimatedValue);
            await createOrder.ExecuteNonQueryAsync(cancellationToken);
        }
        else if (action == "mark_delivered")
        {
            await using var updateOrder = new NpgsqlCommand(
                "UPDATE orders SET status = 'delivered' WHERE customer_id = @id AND status = 'in_fulfillment'", connection, transaction);
            updateOrder.Parameters.AddWithValue("id", customerId);
            await updateOrder.ExecuteNonQueryAsync(cancellationToken);
        }

        var eventId = await InsertEventAsync(connection, transaction, customerId, department,
            action, current.LifecycleStage, toStage, new { note }, cancellationToken);
        var updated = current with { LifecycleStage = toStage, UpdatedAt = DateTimeOffset.UtcNow };
        await InsertOutboxAsync(connection, transaction, eventId, updated, action, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return updated;
    }

    /// <inheritdoc />
    public async Task<int> ProcessOutboxBatchAsync(int batchSize, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        const string readSql = """
            SELECT id, event_id, payload
            FROM workflow_outbox
            WHERE processed_at IS NULL
            ORDER BY id
            LIMIT @batchSize
            FOR UPDATE SKIP LOCKED
            """;
        var pending = new List<OutboxMessage>(batchSize);
        await using (var command = new NpgsqlCommand(readSql, connection, transaction))
        {
            command.Parameters.AddWithValue("batchSize", batchSize);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                using var payload = JsonDocument.Parse(reader.GetString(2));
                var root = payload.RootElement;
                pending.Add(new OutboxMessage(
                    reader.GetInt64(0), reader.GetInt64(1), root.GetProperty("customerId").GetGuid(),
                    root.GetProperty("name").GetString() ?? "Customer", root.GetProperty("toStage").GetString() ?? string.Empty));
            }
        }

        foreach (var message in pending)
        {
            var targetDepartment = TargetDepartmentForStage(message.ToStage);
            if (targetDepartment is not null)
            {
                await using var notification = new NpgsqlCommand("""
                    INSERT INTO automation_notifications (event_id, customer_id, target_department, message)
                    VALUES (@eventId, @customerId, @department, @message)
                    ON CONFLICT (event_id) DO NOTHING
                    """, connection, transaction);
                notification.Parameters.AddWithValue("eventId", message.EventId);
                notification.Parameters.AddWithValue("customerId", message.CustomerId);
                notification.Parameters.AddWithValue("department", targetDepartment);
                notification.Parameters.AddWithValue("message", $"{message.Name} entered the {targetDepartment} queue");
                await notification.ExecuteNonQueryAsync(cancellationToken);
            }

            await using var markProcessed = new NpgsqlCommand(
                "UPDATE workflow_outbox SET processed_at = NOW() WHERE id = @id", connection, transaction);
            markProcessed.Parameters.AddWithValue("id", message.Id);
            await markProcessed.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return pending.Count;
    }

    private static CustomerResponse ReadCustomer(NpgsqlDataReader reader) => new(
        reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
        reader.GetString(4), reader.GetString(5), reader.GetDecimal(6), reader.GetDecimal(7),
        reader.GetString(8), reader.GetFieldValue<DateTimeOffset>(9));

    private static async Task<long> InsertEventAsync(
        NpgsqlConnection connection, NpgsqlTransaction transaction, Guid customerId, string department,
        string action, string? fromStage, string toStage, object details, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO lifecycle_events (customer_id, department, action, from_stage, to_stage, details)
            VALUES (@customerId, @department, @action, @fromStage, @toStage, @details)
            RETURNING id
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("customerId", customerId);
        command.Parameters.AddWithValue("department", department);
        command.Parameters.AddWithValue("action", action);
        command.Parameters.AddWithValue("fromStage", NpgsqlDbType.Text, (object?)fromStage ?? DBNull.Value);
        command.Parameters.Add(new NpgsqlParameter("details", NpgsqlDbType.Jsonb) { Value = JsonSerializer.Serialize(details) });
        command.Parameters.AddWithValue("toStage", toStage);
        return (long)(await command.ExecuteScalarAsync(cancellationToken) ?? throw new InvalidOperationException("Event insert returned no id."));
    }

    private static async Task InsertOutboxAsync(
        NpgsqlConnection connection, NpgsqlTransaction transaction, long eventId,
        CustomerResponse customer, string action, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(new
        {
            customerId = customer.Id,
            name = customer.Name,
            toStage = customer.LifecycleStage,
            action,
        });
        await using var command = new NpgsqlCommand(
            "INSERT INTO workflow_outbox (event_id, payload) VALUES (@eventId, @payload)", connection, transaction);
        command.Parameters.AddWithValue("eventId", eventId);
        command.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Jsonb) { Value = payload });
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string? TargetDepartmentForStage(string stage) => stage switch
    {
        LifecycleStage.NewLead => Department.Marketing,
        LifecycleStage.WarmLead => Department.InsideSales,
        LifecycleStage.Qualified => Department.Sales,
        LifecycleStage.ClosedWon or LifecycleStage.RenewalDue => Department.Ordering,
        LifecycleStage.AwaitingDelivery => Department.Delivery,
        LifecycleStage.ActiveCustomer => Department.Retention,
        _ => null,
    };

    private async Task SeedWalkthroughProfilesAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        const string seedSql = """
            INSERT INTO customers (name, company, email, lifecycle_stage, campaign, estimated_value)
            SELECT sample.name, sample.company, sample.email, sample.stage, sample.campaign, sample.value
            FROM (VALUES
                ('Avery Johnson', 'Northstar Health', 'avery@northstar.example', 'new_lead', 'Fall product launch', 18000::numeric),
                ('Jordan Kim', 'Juniper Works', 'jordan@juniper.example', 'warm_lead', 'Operations webinar', 24000::numeric),
                ('Riley Patel', 'Clearwater Group', 'riley@clearwater.example', 'qualified', 'Fall product launch', 42000::numeric),
                ('Casey Morgan', 'Atlas Field Services', 'casey@atlas.example', 'closed_won', 'Partner referrals', 31500::numeric),
                ('Taylor Reed', 'Brightline Studio', 'taylor@brightline.example', 'awaiting_delivery', 'Operations webinar', 12800::numeric),
                ('Quinn Rivera', 'Pioneer Systems', 'quinn@pioneer.example', 'active_customer', 'Fall product launch', 56000::numeric)
            ) AS sample(name, company, email, stage, campaign, value)
            WHERE NOT EXISTS (SELECT 1 FROM customers)
            ON CONFLICT (email) DO NOTHING;

            INSERT INTO orders (customer_id, status, amount)
            SELECT id, 'in_fulfillment', estimated_value FROM customers
            WHERE lifecycle_stage = 'awaiting_delivery'
              AND NOT EXISTS (SELECT 1 FROM orders WHERE orders.customer_id = customers.id);

            INSERT INTO lifecycle_events (customer_id, department, action, from_stage, to_stage, details)
            SELECT customer.id,
                CASE history.stage
                    WHEN 'new_lead' THEN 'marketing' WHEN 'warm_lead' THEN 'inside-sales'
                    WHEN 'qualified' THEN 'sales' WHEN 'closed_won' THEN 'ordering'
                    WHEN 'awaiting_delivery' THEN 'delivery' ELSE 'retention'
                END,
                'sample_history',
                CASE WHEN history.stage_index = 1 THEN NULL ELSE seed.stage_path[(history.stage_index - 1)::int] END,
                history.stage,
                '{"source":"sample data"}'::jsonb
            FROM (VALUES
                ('avery@northstar.example', ARRAY['new_lead']::text[]),
                ('jordan@juniper.example', ARRAY['new_lead', 'warm_lead']::text[]),
                ('riley@clearwater.example', ARRAY['new_lead', 'warm_lead', 'qualified']::text[]),
                ('casey@atlas.example', ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won']::text[]),
                ('taylor@brightline.example', ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery']::text[]),
                ('quinn@pioneer.example', ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery', 'active_customer']::text[])
            ) AS seed(email, stage_path)
            JOIN customers customer ON customer.email = seed.email
            CROSS JOIN LATERAL unnest(seed.stage_path) WITH ORDINALITY AS history(stage, stage_index)
            WHERE NOT EXISTS (SELECT 1 FROM lifecycle_events WHERE lifecycle_events.customer_id = customer.id);
            """;
        await using var command = new NpgsqlCommand(seedSql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private sealed record OutboxMessage(long Id, long EventId, Guid CustomerId, string Name, string ToStage);
}
