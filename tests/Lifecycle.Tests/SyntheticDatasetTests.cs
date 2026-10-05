using Lifecycle.Core.SeedData;
using Xunit;

namespace Lifecycle.Tests;

public sealed class SyntheticDatasetTests
{
    [Fact]
    public void IndustryApportionmentMatchesTheCensusFirmMixAtTwentyFiveThousandProfiles()
    {
        var accounts = SyntheticDatasetGenerator.Generate(25_000);

        Assert.Equal(25_000, accounts.Count);
        Assert.Equal(24_384, accounts.Count(account => account.IndustryCode == "442110"));
        Assert.Equal(616, accounts.Count(account => account.IndustryCode == "337910"));
    }

    [Fact]
    public void GeneratedAccountsUseFictionalContactDetailsAndStableSyntheticRevenue()
    {
        var firstRun = SyntheticDatasetGenerator.Generate(500);
        var secondRun = SyntheticDatasetGenerator.Generate(500);

        Assert.All(firstRun, account => Assert.EndsWith("@customers.example", account.Email, StringComparison.Ordinal));
        Assert.Equal(500, firstRun.Select(account => account.Email).Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(firstRun.Select(account => account.AnnualRevenue), secondRun.Select(account => account.AnnualRevenue));
        Assert.All(firstRun, account => Assert.Equal(decimal.Round(account.AnnualRevenue * 0.01m, 2), account.EstimatedValue));
    }

    [Theory]
    [InlineData("Under $100K", 0, 99_999)]
    [InlineData("$1M-$2.499M", 1_000_000, 2_499_999)]
    [InlineData("$100M+", 100_000_000, null)]
    public void ReceiptBandBoundaryChecksUseThePublishedIntervals(string band, int minimum, int? maximum)
    {
        Assert.True(SyntheticDatasetGenerator.FitsReceiptBand(band, minimum));
        if (maximum is not null)
        {
            Assert.True(SyntheticDatasetGenerator.FitsReceiptBand(band, maximum.Value));
            Assert.False(SyntheticDatasetGenerator.FitsReceiptBand(band, maximum.Value + 0.01m));
        }
        else
        {
            Assert.True(SyntheticDatasetGenerator.FitsReceiptBand(band, minimum + 1_000_000_000m));
        }
    }
}
