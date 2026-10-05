import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

type ReceiptBand = { label: string; firms: number; receiptsThousands: number };
type Industry = { naics: string; firms: number; receiptsThousands: number; bands: ReceiptBand[] };

const benchmarkPath = new URL('../data/census-2022-receipts.json', import.meta.url);
const benchmark = JSON.parse(readFileSync(fileURLToPath(benchmarkPath), 'utf8')) as { industries: Industry[] };

test('Census receipt-band counts and receipts sum to the published industry totals', () => {
  assert.deepEqual(benchmark.industries.map((industry) => industry.naics), ['442110', '337910']);
  for (const industry of benchmark.industries) {
    assert.equal(industry.bands.reduce((sum, band) => sum + band.firms, 0), industry.firms);
    assert.equal(industry.bands.reduce((sum, band) => sum + band.receiptsThousands, 0), industry.receiptsThousands);
  }
});

test('largest revenue band represents a small firm share but most receipts', () => {
  for (const industry of benchmark.industries) {
    const largestBand = industry.bands.at(-1)!;
    assert.equal(largestBand.label, '$100M+');
    assert.ok(largestBand.firms / industry.firms < 0.1);
    assert.ok(largestBand.receiptsThousands / industry.receiptsThousands > 0.5);
  }
});
