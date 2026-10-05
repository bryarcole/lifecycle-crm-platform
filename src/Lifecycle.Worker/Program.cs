using Lifecycle.Core;
using Lifecycle.Core.Services;
using Lifecycle.Worker;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddLifecycleCore(builder.Configuration);
builder.Services.AddHostedService<OutboxWorker>();

var app = builder.Build();
app.MapGet("/health", () => TypedResults.Ok(new WorkerHealthResponse("ok", "automation-worker")))
    .WithName("GetAutomationWorkerHealth")
    .WithSummary("Check automation worker health")
    .Produces<WorkerHealthResponse>(StatusCodes.Status200OK);
app.Run();

/// <summary>Health response returned by the worker probe endpoint.</summary>
public sealed record WorkerHealthResponse(string Status, string Service);
