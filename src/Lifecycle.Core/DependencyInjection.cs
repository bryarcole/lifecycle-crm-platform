using Lifecycle.Core.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Lifecycle.Core;

/// <summary>Registers CRM persistence and application services.</summary>
public static class DependencyInjection
{
    /// <summary>Registers a pooled PostgreSQL data source and the CRM application/repository boundaries.</summary>
    public static IServiceCollection AddLifecycleCore(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Crm")
            ?? configuration["DATABASE_URL"]
            ?? "Host=localhost;Port=5432;Database=lifecycle_crm;Username=crm_app;Password=local_only_change_me";

        services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
        services.AddScoped<NpgsqlCrmRepository>();
        services.AddScoped<ICrmReadStore>(provider => provider.GetRequiredService<NpgsqlCrmRepository>());
        services.AddScoped<IWorkflowStore>(provider => provider.GetRequiredService<NpgsqlCrmRepository>());
        services.AddScoped<IOutboxStore>(provider => provider.GetRequiredService<NpgsqlCrmRepository>());
        services.AddScoped<ICrmApplicationService, CrmApplicationService>();
        return services;
    }
}
