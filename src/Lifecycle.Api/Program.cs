using System.Text.Json.Serialization;
using Lifecycle.Api.Endpoints;
using Lifecycle.Api.Middleware;
using Lifecycle.Core;
using Lifecycle.Core.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();
builder.Services.AddValidation();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddLifecycleCore(builder.Configuration);

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapHealthEndpoints();
app.MapDashboardEndpoints();
app.MapDepartmentEndpoints();
app.MapActivityEndpoints();
app.MapNotificationEndpoints();

await using (var scope = app.Services.CreateAsyncScope())
{
    await scope.ServiceProvider.GetRequiredService<IOutboxStore>()
        .InitializeAsync(app.Lifetime.ApplicationStopping);
}

app.Run();

/// <summary>Entry point marker used by integration tests.</summary>
public partial class Program;
