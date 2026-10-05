using Lifecycle.Core.SeedData;
using Npgsql;
using NpgsqlTypes;

var count = ReadCount(args);
var reset = args.Contains("--reset", StringComparer.Ordinal);
var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? "Host=localhost;Port=5432;Database=lifecycle_crm;Username=crm_app;Password=local_only_change_me";
var accounts = SyntheticDatasetGenerator.Generate(count);
await using var dataSource = NpgsqlDataSource.Create(connectionString);
await using var connection = await dataSource.OpenConnectionAsync();

var existingCount = (long)(await new NpgsqlCommand("SELECT COUNT(*) FROM customers", connection).ExecuteScalarAsync() ?? 0L);
if (existingCount > 0 && !reset)
{
    Console.Error.WriteLine($"Database already contains {existingCount:N0} customers. Pass --reset to replace demo data.");
    return 1;
}

await using var transaction = await connection.BeginTransactionAsync();
try
{
    if (reset)
    {
        await using var truncate = new NpgsqlCommand("TRUNCATE TABLE customers CASCADE", connection, transaction);
        await truncate.ExecuteNonQueryAsync();
    }

    await using (var importer = await connection.BeginBinaryImportAsync("""
        COPY customers (name, company, email, lifecycle_stage, campaign, estimated_value, industry_code, annual_revenue)
        FROM STDIN (FORMAT BINARY)
        """))
    {
        foreach (var account in accounts)
        {
            await importer.StartRowAsync();
            await importer.WriteAsync(account.Name, NpgsqlDbType.Text);
            await importer.WriteAsync(account.Company, NpgsqlDbType.Text);
            await importer.WriteAsync(account.Email, NpgsqlDbType.Text);
            await importer.WriteAsync(account.LifecycleStage, NpgsqlDbType.Text);
            await importer.WriteAsync(account.Campaign, NpgsqlDbType.Text);
            await importer.WriteAsync(account.EstimatedValue, NpgsqlDbType.Numeric);
            await importer.WriteAsync(account.IndustryCode, NpgsqlDbType.Text);
            await importer.WriteAsync(account.AnnualRevenue, NpgsqlDbType.Numeric);
        }
        await importer.CompleteAsync();
    }

    const string seedHistorySql = """
        INSERT INTO lifecycle_events (customer_id, department, action, from_stage, to_stage, details, created_at)
        SELECT customers.id,
            CASE history.stage
                WHEN 'new_lead' THEN 'marketing' WHEN 'warm_lead' THEN 'inside-sales'
                WHEN 'qualified' THEN 'sales' WHEN 'closed_won' THEN 'ordering'
                WHEN 'closed_lost' THEN 'sales' WHEN 'awaiting_delivery' THEN 'delivery' ELSE 'retention'
            END,
            CASE WHEN history.stage_index = 1 THEN 'sample_profile_created'
                WHEN history.stage = 'new_lead' THEN 'cross_sell'
                WHEN history.stage = 'warm_lead' THEN 'engage_lead'
                WHEN history.stage = 'qualified' THEN 'qualify'
                WHEN history.stage = 'closed_won' THEN 'close_won'
                WHEN history.stage = 'closed_lost' THEN 'close_lost'
                WHEN history.stage = 'awaiting_delivery' THEN 'create_order'
                ELSE 'mark_delivered' END,
            CASE WHEN history.stage_index = 1 THEN NULL ELSE stage_path.path[(history.stage_index - 1)::int] END,
            history.stage,
            jsonb_build_object('source', 'synthetic_demo', 'naics', customers.industry_code),
            NOW() - random() * INTERVAL '90 days'
        FROM customers
        CROSS JOIN LATERAL (SELECT CASE customers.lifecycle_stage
            WHEN 'new_lead' THEN ARRAY['new_lead']::text[]
            WHEN 'warm_lead' THEN ARRAY['new_lead', 'warm_lead']::text[]
            WHEN 'qualified' THEN ARRAY['new_lead', 'warm_lead', 'qualified']::text[]
            WHEN 'closed_won' THEN ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won']::text[]
            WHEN 'closed_lost' THEN ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_lost']::text[]
            WHEN 'awaiting_delivery' THEN ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery']::text[]
            WHEN 'active_customer' THEN ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery', 'active_customer']::text[]
            ELSE ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery', 'active_customer', 'renewal_due']::text[]
        END AS path) AS stage_path
        CROSS JOIN LATERAL unnest(stage_path.path) WITH ORDINALITY AS history(stage, stage_index);

        INSERT INTO orders (customer_id, status, amount)
        SELECT id,
            CASE lifecycle_stage WHEN 'awaiting_delivery' THEN 'in_fulfillment' ELSE 'delivered' END,
            estimated_value
        FROM customers
        WHERE lifecycle_stage IN ('awaiting_delivery', 'active_customer', 'renewal_due');
        """;
    await using (var history = new NpgsqlCommand(seedHistorySql, connection, transaction))
    {
        await history.ExecuteNonQueryAsync();
    }

    await transaction.CommitAsync();
}
catch
{
    await transaction.RollbackAsync();
    throw;
}

Console.WriteLine($"Seeded {accounts.Count:N0} synthetic profiles using the 2022 Census firm receipt-size distribution.");
foreach (var industry in accounts.GroupBy(account => account.IndustryCode).OrderBy(group => group.Key))
{
    var name = industry.Key == "337910" ? "Mattress manufacturing" : "Furniture and mattress retail";
    Console.WriteLine($"{industry.Key} {name}: {industry.Count():N0} accounts, {industry.Sum(account => account.AnnualRevenue):C0} synthetic annual revenue");
}
Console.WriteLine("All contact names and company names are fictional; email addresses use the reserved .example domain.");
return 0;

static int ReadCount(IReadOnlyList<string> arguments)
{
    var countArgument = arguments.FirstOrDefault(argument => argument.StartsWith("--count=", StringComparison.Ordinal));
    if (countArgument is null) return 25_000;
    if (!int.TryParse(countArgument.AsSpan("--count=".Length), out var count) || count is < 1 or > 1_000_000)
    {
        throw new ArgumentException("--count must be a whole number between 1 and 1,000,000.");
    }
    return count;
}
