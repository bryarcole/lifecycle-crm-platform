using System.Reflection;
using System.Text.Json;
using Lifecycle.Core.Domain;

namespace Lifecycle.Core.SeedData;

/// <summary>A synthetic CRM contact and firm profile sampled from an industry receipts-size band.</summary>
public sealed record SyntheticAccount(
    string Name,
    string Company,
    string Email,
    string Campaign,
    string IndustryCode,
    decimal AnnualRevenue,
    decimal EstimatedValue,
    string LifecycleStage);

/// <summary>Generates fictional company profiles using published Census firm counts and annual receipt bands.</summary>
public static class SyntheticDatasetGenerator
{
    private static readonly string[] FirstNames =
    ["Alex", "Avery", "Blake", "Cameron", "Casey", "Charlie", "Drew", "Elliot", "Emerson", "Finley", "Harper", "Jamie", "Jordan", "Jules", "Kai", "Logan", "Morgan", "Parker", "Quinn", "Reese", "Riley", "Robin", "Rowan", "Sam", "Taylor"];
    private static readonly string[] LastNames =
    ["Adams", "Anderson", "Bennett", "Brooks", "Campbell", "Carter", "Chen", "Collins", "Diaz", "Ellis", "Foster", "Garcia", "Gray", "Hall", "Hayes", "Hughes", "Jackson", "James", "Kim", "Lewis", "Martin", "Morgan", "Nguyen", "Patel", "Perry", "Reed", "Rivera", "Ross", "Shah", "Turner", "Wright", "Young"];
    private static readonly string[] CompanyRoots =
    ["Cedar & Stone", "Northwind", "Juniper House", "Harborline", "Pioneer", "Evergreen", "Summit", "Clearwater", "Maple & Main", "Brightline", "Redwood", "Atlas", "Willow Creek", "Blue Ridge", "Silverleaf", "Fieldstone", "Westward", "Lakeshore", "Oak & Alder", "Meridian"];
    private static readonly string[] Campaigns =
    ["Spring showroom refresh", "Regional dealer program", "Sleep better launch", "Trade partner referral", "Hospitality sourcing", "Fall product launch"];
    private static readonly (int Limit, string Stage)[] StageThresholds =
    [
        (16, LifecycleStage.NewLead), (28, LifecycleStage.WarmLead), (39, LifecycleStage.Qualified),
        (49, LifecycleStage.ClosedWon), (52, LifecycleStage.ClosedLost),
        (62, LifecycleStage.AwaitingDelivery), (92, LifecycleStage.ActiveCustomer),
        (100, LifecycleStage.RenewalDue),
    ];

    /// <summary>Creates a repeatable synthetic account set; records use reserved .example email addresses.</summary>
    public static IReadOnlyList<SyntheticAccount> Generate(int count, int seed = 20261004)
    {
        if (count is < 1 or > 1_000_000) throw new ArgumentOutOfRangeException(nameof(count), "Count must be between 1 and 1,000,000.");
        var benchmark = LoadBenchmark();
        ValidateBenchmark(benchmark);
        var random = new Random(seed);
        var industryCounts = Apportion(count, benchmark.Industries.Select(industry => industry.Firms).ToArray());
        var accounts = new List<RevenueAccount>(count);

        for (var industryIndex = 0; industryIndex < benchmark.Industries.Length; industryIndex++)
        {
            var industry = benchmark.Industries[industryIndex];
            var bandCounts = Apportion(industryCounts[industryIndex], industry.Bands.Select(band => band.Firms).ToArray());
            for (var bandIndex = 0; bandIndex < industry.Bands.Length; bandIndex++)
            {
                var band = industry.Bands[bandIndex];
                foreach (var revenue in CreateRevenues(band, bandCounts[bandIndex], random))
                {
                    accounts.Add(new RevenueAccount(industry.Naics, industry.Name, revenue));
                }
            }
        }

        Shuffle(accounts, random);
        return accounts.Select((account, index) =>
        {
            var sequence = index + 1;
            var suffix = sequence.ToString($"D{count.ToString().Length}", System.Globalization.CultureInfo.InvariantCulture);
            var firstName = FirstNames[random.Next(FirstNames.Length)];
            var lastName = LastNames[random.Next(LastNames.Length)];
            var root = CompanyRoots[random.Next(CompanyRoots.Length)];
            var companyType = account.IndustryCode == "337910" ? "Sleep Products" : "Home & Mattress";
            return new SyntheticAccount(
                $"{firstName} {lastName}", $"{root} {companyType} {suffix}",
                $"contact-{suffix}@customers.example", Campaigns[random.Next(Campaigns.Length)],
                account.IndustryCode, account.AnnualRevenue, decimal.Round(account.AnnualRevenue * 0.01m, 2),
                SelectLifecycleStage(random));
        }).ToArray();
    }

    /// <summary>Returns the receipts interval containing an annual revenue value.</summary>
    public static bool FitsReceiptBand(string label, decimal annualRevenue)
    {
        var band = LoadBenchmark().Industries.SelectMany(industry => industry.Bands)
            .FirstOrDefault(candidate => candidate.Label == label);
        if (band is null) return false;
        var minimum = band.MinDollars;
        var maximum = band.MaxDollars;
        return annualRevenue >= minimum && (maximum is null || annualRevenue <= maximum.Value);
    }

    private static BenchmarkFile LoadBenchmark()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Lifecycle.Core.Data.census-2022-receipts.json")
            ?? throw new InvalidOperationException("The Census receipt-size benchmark is missing.");
        return JsonSerializer.Deserialize<BenchmarkFile>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("The Census receipt-size benchmark could not be read.");
    }

    private static void ValidateBenchmark(BenchmarkFile benchmark)
    {
        foreach (var industry in benchmark.Industries)
        {
            if (industry.Bands.Sum(band => band.Firms) != industry.Firms ||
                industry.Bands.Sum(band => band.ReceiptsThousands) != industry.ReceiptsThousands)
            {
                throw new InvalidOperationException($"Census receipt-band totals are inconsistent for NAICS {industry.Naics}.");
            }
        }
    }

    private static string SelectLifecycleStage(Random random)
    {
        var value = random.Next(100);
        return StageThresholds.First(entry => value < entry.Limit).Stage;
    }

    private static int[] Apportion(int total, IReadOnlyList<int> weights)
    {
        var weightTotal = weights.Sum();
        var exact = weights.Select(weight => (double)total * weight / weightTotal).ToArray();
        var counts = exact.Select(Math.Floor).Select(value => (int)value).ToArray();
        var remaining = total - counts.Sum();
        var order = Enumerable.Range(0, exact.Length)
            .OrderByDescending(index => exact[index] - counts[index])
            .ThenBy(index => index)
            .Take(remaining);
        foreach (var index in order) counts[index]++;
        return counts;
    }

    private static IEnumerable<decimal> CreateRevenues(ReceiptBand band, int count, Random random)
    {
        if (count == 0) return [];
        var publishedMean = (decimal)band.ReceiptsThousands * 1_000m / band.Firms;
        var mean = Math.Max(band.MinDollars, Math.Min(band.MaxDollars ?? decimal.MaxValue, publishedMean));
        var distanceToLowerBound = mean - band.MinDollars;
        var distanceToUpperBound = band.MaxDollars is null ? distanceToLowerBound : band.MaxDollars.Value - mean;
        var spread = Math.Min(distanceToLowerBound, distanceToUpperBound) * 0.82m;
        var revenues = new List<decimal>(count);
        for (var index = 0; index + 1 < count; index += 2)
        {
            var offset = spread * (decimal)random.NextDouble();
            revenues.Add(decimal.Round(mean + offset, 2));
            revenues.Add(decimal.Round(mean - offset, 2));
        }
        if (count % 2 == 1) revenues.Add(decimal.Round(mean, 2));
        Shuffle(revenues, random);
        return revenues;
    }

    private static void Shuffle<T>(IList<T> items, Random random)
    {
        for (var index = items.Count - 1; index > 0; index--)
        {
            var swap = random.Next(index + 1);
            (items[index], items[swap]) = (items[swap], items[index]);
        }
    }

    private sealed record RevenueAccount(string IndustryCode, string IndustryName, decimal AnnualRevenue);
    private sealed record BenchmarkFile(BenchmarkIndustry[] Industries);
    private sealed record BenchmarkIndustry(string Naics, string Name, int Firms, long ReceiptsThousands, ReceiptBand[] Bands);
    private sealed record ReceiptBand(string Label, decimal MinDollars, decimal? MaxDollars, int Firms, long ReceiptsThousands);
}
