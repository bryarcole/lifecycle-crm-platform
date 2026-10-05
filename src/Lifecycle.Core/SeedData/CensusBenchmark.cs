namespace Lifecycle.Core.SeedData;

/// <summary>One public Census SUSB firm and receipts-size band used by the synthetic profile generator.</summary>
public sealed record CensusReceiptBand(string Label, decimal MinimumDollars, decimal? MaximumDollars, int Firms, long ReceiptsThousands);

/// <summary>Industry-level 2022 Census SUSB firm and receipts-size observations.</summary>
public sealed record CensusIndustry(string Naics, string Name, int Firms, long ReceiptsThousands, IReadOnlyList<CensusReceiptBand> Bands);
