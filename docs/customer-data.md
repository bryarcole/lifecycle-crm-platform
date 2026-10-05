# Synthetic furniture and mattress accounts

## What the 25,000 records represent

The demo creates exactly 25,000 **synthetic company accounts** and synthetic contact names. It does not download, copy, or approximate individual U.S. businesses. All generated email addresses end in the reserved `.example` domain and are not deliverable. No customer names, email lists, addresses, or private firm-level records are included.

Industry counts are scaled from the U.S. Census Bureau's published 2022 Statistics of U.S. Businesses (SUSB) national firm counts:

| 2017 NAICS | Census industry | Published U.S. firms | Synthetic accounts |
| --- | --- | ---: | ---: |
| 442110 | Furniture Stores, which includes mattress stores | 12,708 | 24,384 |
| 337910 | Mattress Manufacturing | 321 | 616 |
| **Total** | | **13,029** | **25,000** |

The 442110 Census industry includes retail establishments selling household furniture and mattresses; the published table does not separate furniture retailers from specialty mattress retailers. Synthetic profiles therefore retain the combined source category instead of claiming an unsupported split.

## Receipt-size distribution

The source's size categories are bands of annual enterprise receipts, in thousands of dollars. Each synthetic account is assigned a Census band using proportional allocation of its band's published firm count. Revenue values are generated inside the selected band. The open-ended `$100M+` band is sampled above its lower bound.

| Annual receipts per firm | Furniture-store firms | Mattress-manufacturing firms |
| --- | ---: | ---: |
| Under $100K | 850 | 15 |
| $100K–$499K | 3,004 | 56 |
| $500K–$999K | 2,421 | 40 |
| $1M–$2.499M | 3,321 | 54 |
| $2.5M–$4.999M | 1,671 | 40 |
| $5M–$7.499M | 529 | 16 |
| $7.5M–$9.999M | 233 | 12 |
| $10M–$14.999M | 219 | 18 |
| $15M–$19.999M | 115 | 10 |
| $20M–$24.999M | 67 | 10 |
| $25M–$29.999M | 40 | 5 |
| $30M–$34.999M | 29 | 4 |
| $35M–$39.999M | 23 | 3 |
| $40M–$49.999M | 22 | 4 |
| $50M–$74.999M | 45 | 9 |
| $75M–$99.999M | 17 | 4 |
| $100M+ | 102 | 21 |

The table shows strong revenue concentration among large firms: Census reports $45.48 billion of the furniture-store group's $76.38 billion in total receipts in the `$100M+` size band, and $6.64 billion of the mattress-manufacturing group's $9.00 billion in that band. That is about 59.6% and 73.7% of each industry's published receipts, respectively. In the combined synthetic sample, fewer than 1% of accounts fall in this top band, illustrating why record count and revenue share are distinct measures.

## Interpretation and limitations

- The Census table is aggregate data, classified using **2017 NAICS codes**, even though the observation year is 2022. Furniture-store NAICS 442110 explicitly includes mattress stores; mattress manufacturing is NAICS 337910.
- Census receipt totals carry disclosure-control noise flags. In a few bins, the noise-adjusted published receipt total divided by the firm count implies an average just outside that bin's nominal limits. The generator clamps that bin's synthetic per-company average to the nearest boundary so every generated record stays in its assigned band. Consequently the generated aggregate is an approximation and will not exactly equal published receipts.
- Census enterprise receipts are company size, not household spending, profit, gross margin, contract value, or CRM opportunity value.
- The generator uses a deterministic seed. Names, company labels, campaign attribution, lifecycle state, and individual revenue values are fictional. Estimated opportunity value is separately modeled as approximately 1% of annual company revenue; it is a demo assumption, not a Census measure.
- Lifecycle-stage mix is scenario data to populate every department queue. It is not estimated from Census business statistics.
- The local seed script defaults to 25,000 profiles. `--reset` deletes all customers from the configured database; related event, order, notification, and outbox rows are removed by foreign-key cascade. Use only against a dedicated demo database.

## Rebuild the dataset

Start the CRM service so it has created the database schema, then run from the repository root:

```sh
DATABASE_URL='postgres://crm_app:local_only_change_me@localhost:5432/lifecycle_crm' npm run seed:customers -- --count=25000 --reset
```

To keep current records, the generator refuses to run against a non-empty database unless `--reset` is supplied. Its output reports the actual generated total and industry split.

## Sources

- U.S. Census Bureau, [2022 SUSB Annual Data Tables by Establishment Industry](https://www.census.gov/data/tables/2022/econ/susb/2022-susb-annual.html). The table page documents that SUSB includes firm counts, establishments, employment, payroll, and receipts by industry and enterprise receipt size.
- U.S. Census Bureau, [2022 national six-digit NAICS enterprise receipts-size workbook](https://www2.census.gov/programs-surveys/susb/tables/2022/us_6digitnaics_rcptsize_2022.xlsx). The public workbook is also summarized in [data/census-2022-receipts.json](../data/census-2022-receipts.json).
- U.S. Census Bureau, [2017 NAICS 442110 definition](https://www.census.gov/naics/?input=442110&year=2017&details=442110) and [2017 NAICS 337910 definition](https://www.census.gov/naics/?input=337910&year=2017&details=337910).
