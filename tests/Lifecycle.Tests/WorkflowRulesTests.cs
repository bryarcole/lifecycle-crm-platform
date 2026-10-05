using Lifecycle.Core.Domain;
using Xunit;

namespace Lifecycle.Tests;

public sealed class WorkflowRulesTests
{
    [Theory]
    [InlineData("marketing", "new_lead")]
    [InlineData("inside-sales", "warm_lead")]
    [InlineData("sales", "qualified")]
    [InlineData("ordering", "closed_won")]
    [InlineData("ordering", "renewal_due")]
    [InlineData("delivery", "awaiting_delivery")]
    [InlineData("retention", "active_customer")]
    public void QueueStagesBelongToTheExpectedDepartment(string department, string stage)
    {
        Assert.Contains(stage, WorkflowRules.FindQueueStages(department)!);
    }

    [Theory]
    [InlineData("marketing", "engage_lead", "new_lead", "warm_lead")]
    [InlineData("inside-sales", "qualify", "warm_lead", "qualified")]
    [InlineData("sales", "close_won", "qualified", "closed_won")]
    [InlineData("ordering", "create_order", "closed_won", "awaiting_delivery")]
    [InlineData("delivery", "mark_delivered", "awaiting_delivery", "active_customer")]
    [InlineData("retention", "start_renewal", "active_customer", "renewal_due")]
    [InlineData("retention", "cross_sell", "active_customer", "new_lead")]
    public void PrimaryLifecycleCommandsUseTheDocumentedTransition(
        string department, string action, string currentStage, string expectedStage)
    {
        var transition = WorkflowRules.FindTransition(action);
        Assert.NotNull(transition);
        Assert.Equal(department, transition.Department);
        Assert.Contains(currentStage, transition.FromStages);
        Assert.Equal(expectedStage, transition.ToStage);
    }

    [Fact]
    public void UnknownDepartmentAndActionAreRejected()
    {
        Assert.Null(WorkflowRules.FindQueueStages("operations"));
        Assert.Null(WorkflowRules.FindTransition("skip_to_delivery"));
    }
}
