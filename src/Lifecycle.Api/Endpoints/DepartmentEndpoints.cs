using Lifecycle.Core.Contracts;
using Lifecycle.Core.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Lifecycle.Api.Endpoints;

/// <summary>Maps one reusable department API surface instead of six duplicated service implementations.</summary>
public static class DepartmentEndpoints
{
    /// <summary>Maps department queues, CRM profile reads, and department-authorized workflow commands.</summary>
    public static WebApplication MapDepartmentEndpoints(this WebApplication app)
    {
        var department = app.MapGroup("/api/{department}").WithTags("Departments");
        department.MapGet("/queue", async Task<Results<Ok<QueueResponse>, NotFound<ProblemDetails>>> (
            string department, int? limit, int? offset, string? search,
            ICrmApplicationService crm, CancellationToken cancellationToken) =>
        {
            try
            {
                return TypedResults.Ok(await crm.GetQueueAsync(
                    department, limit ?? 50, offset ?? 0, search, cancellationToken));
            }
            catch (Lifecycle.Core.Domain.CrmEntityNotFoundException)
            {
                return TypedResults.NotFound(new ProblemDetails { Title = "Department not found" });
            }
        })
            .WithName("GetDepartmentQueue")
            .WithSummary("Get a paginated department queue")
            .WithDescription("Returns up to 100 customers at a time with optional case-insensitive search across contact and company fields.")
            .Produces<QueueResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound);

        department.MapPost("/actions", async Task<Results<Created<WorkflowActionResponse>, Ok<WorkflowActionResponse>>> (
            string department, WorkflowActionRequest request,
            ICrmApplicationService crm, CancellationToken cancellationToken) =>
        {
            var result = await crm.ExecuteActionAsync(department, request, cancellationToken);
            return request.Action == "capture_lead"
                ? TypedResults.Created($"/api/customers/{result.Customer.Id}", result)
                : TypedResults.Ok(result);
        })
            .WithName("RunDepartmentAction")
            .WithSummary("Run a department-owned lifecycle command")
            .WithDescription("CRM validates department ownership and the current state, then commits the customer, audit event, order, and outbox update atomically.")
            .Produces<WorkflowActionResponse>(StatusCodes.Status200OK)
            .Produces<WorkflowActionResponse>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        app.MapGet("/api/customers/{customerId:guid}", async Task<Results<Ok<CustomerResponse>, NotFound<ProblemDetails>>> (
            Guid customerId, ICrmApplicationService crm, CancellationToken cancellationToken) =>
        {
            try
            {
                return TypedResults.Ok(await crm.GetCustomerAsync(customerId, cancellationToken));
            }
            catch (Lifecycle.Core.Domain.CrmEntityNotFoundException)
            {
                return TypedResults.NotFound(new ProblemDetails { Title = "Customer not found" });
            }
        })
            .WithName("GetCustomer")
            .WithSummary("Get a customer profile")
            .WithDescription("Returns the customer profile owned by the CRM system of record.")
            .Produces<CustomerResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status404NotFound);
        return app;
    }
}
