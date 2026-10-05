import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const DEFAULT_COUNT = 25_000;
const BATCH_SIZE = 250;
const stages = ['new_lead', 'warm_lead', 'qualified', 'closed_won', 'closed_lost', 'awaiting_delivery', 'active_customer', 'renewal_due'] as const;
type Stage = (typeof stages)[number];
type RevenueBand = { label: string; minDollars: number; maxDollars: number | null; firms: number; receiptsThousands: number };
type Industry = { naics: string; name: string; firms: number; receiptsThousands: number; bands: RevenueBand[] };
type Benchmark = { source: { referenceUrl: string; industryClassification: string; receiptsUnit: string }; industries: Industry[] };
type RevenueAccount = { industryCode: string; industryName: string; band: RevenueBand; annualRevenue: number };
type SyntheticCustomer = RevenueAccount & { name: string; company: string; email: string; lifecycleStage: Stage; campaign: string; estimatedValue: number };

const firstNames = ['Alex', 'Avery', 'Blake', 'Cameron', 'Casey', 'Charlie', 'Drew', 'Elliot', 'Emerson', 'Finley', 'Harper', 'Jamie', 'Jordan', 'Jules', 'Kai', 'Logan', 'Morgan', 'Parker', 'Quinn', 'Reese', 'Riley', 'Robin', 'Rowan', 'Sam', 'Taylor'];
const lastNames = ['Adams', 'Anderson', 'Bennett', 'Brooks', 'Campbell', 'Carter', 'Chen', 'Collins', 'Diaz', 'Ellis', 'Foster', 'Garcia', 'Gray', 'Hall', 'Hayes', 'Hughes', 'Jackson', 'James', 'Kim', 'Lewis', 'Martin', 'Morgan', 'Nguyen', 'Patel', 'Perry', 'Reed', 'Rivera', 'Ross', 'Shah', 'Turner', 'Wright', 'Young'];
const companyRoots = ['Cedar & Stone', 'Northwind', 'Juniper House', 'Harborline', 'Pioneer', 'Evergreen', 'Summit', 'Clearwater', 'Maple & Main', 'Brightline', 'Redwood', 'Atlas', 'Willow Creek', 'Blue Ridge', 'Silverleaf', 'Fieldstone', 'Westward', 'Lakeshore', 'Oak & Alder', 'Meridian'];
const campaigns = ['Spring showroom refresh', 'Regional dealer program', 'Sleep better launch', 'Trade partner referral', 'Hospitality sourcing', 'Fall product launch'];
const lifecycleHistory: Record<Stage, Stage[]> = {
  new_lead: ['new_lead'],
  warm_lead: ['new_lead', 'warm_lead'],
  qualified: ['new_lead', 'warm_lead', 'qualified'],
  closed_won: ['new_lead', 'warm_lead', 'qualified', 'closed_won'],
  closed_lost: ['new_lead', 'warm_lead', 'qualified', 'closed_lost'],
  awaiting_delivery: ['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery'],
  active_customer: ['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery', 'active_customer'],
  renewal_due: ['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery', 'active_customer', 'renewal_due'],
};
const stageThresholds: [number, Stage][] = [
  [16, 'new_lead'], [28, 'warm_lead'], [39, 'qualified'], [49, 'closed_won'],
  [52, 'closed_lost'], [62, 'awaiting_delivery'], [92, 'active_customer'], [100, 'renewal_due'],
];
const actionByStage: Record<Stage, { department: string; action: string }> = {
  new_lead: { department: 'marketing', action: 'capture_lead' },
  warm_lead: { department: 'marketing', action: 'engage_lead' },
  qualified: { department: 'inside-sales', action: 'qualify' },
  closed_won: { department: 'sales', action: 'close_won' },
  closed_lost: { department: 'sales', action: 'close_lost' },
  awaiting_delivery: { department: 'ordering', action: 'create_order' },
  active_customer: { department: 'delivery', action: 'mark_delivered' },
  renewal_due: { department: 'retention', action: 'start_renewal' },
};

function makeRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

function apportion(total: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const exact = weights.map((value) => total * value / weightTotal);
  const counts = exact.map(Math.floor);
  let remaining = total - counts.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) counts[order[index].index] += 1;
  return counts;
}

function revenueValues(band: RevenueBand, count: number, random: () => number): number[] {
  if (count === 0) return [];
  const publishedMean = band.receiptsThousands * 1_000 / band.firms;
  const mean = Math.max(band.minDollars, Math.min(band.maxDollars ?? Infinity, publishedMean));
  const distanceToLowerBound = mean - band.minDollars;
  const distanceToUpperBound = band.maxDollars === null ? distanceToLowerBound : band.maxDollars - mean;
  const spread = Math.min(distanceToLowerBound, distanceToUpperBound) * 0.82;
  const values: number[] = [];
  for (let index = 0; index + 1 < count; index += 2) {
    const offset = spread * random();
    values.push(Math.round((mean + offset) * 100) / 100, Math.round((mean - offset) * 100) / 100);
  }
  if (count % 2 === 1) values.push(Math.round(mean * 100) / 100);
  return shuffled(values, random);
}

function lifecycleStage(random: () => number): Stage {
  const value = random() * 100;
  return stageThresholds.find(([limit]) => value < limit)![1];
}

function buildCustomers(benchmark: Benchmark, count: number): SyntheticCustomer[] {
  const random = makeRandom(20261004);
  const industryCounts = apportion(count, benchmark.industries.map((industry) => industry.firms));
  const accounts: RevenueAccount[] = [];

  benchmark.industries.forEach((industry, industryIndex) => {
    const countsByBand = apportion(industryCounts[industryIndex], industry.bands.map((band) => band.firms));
    industry.bands.forEach((band, bandIndex) => {
      const revenues = revenueValues(band, countsByBand[bandIndex], random);
      for (const annualRevenue of revenues) {
        accounts.push({ industryCode: industry.naics, industryName: industry.name, band, annualRevenue });
      }
    });
  });

  shuffled(accounts, random);
  return accounts.map((account, index) => {
    const sequence = index + 1;
    const number = String(sequence).padStart(String(count).length, '0');
    const firstName = firstNames[Math.floor(random() * firstNames.length)];
    const lastName = lastNames[Math.floor(random() * lastNames.length)];
    const root = companyRoots[Math.floor(random() * companyRoots.length)];
    const companyType = account.industryCode === '337910' ? 'Sleep Products' : 'Home & Mattress';
    return {
      ...account,
      name: `${firstName} ${lastName}`,
      company: `${root} ${companyType} ${number}`,
      email: `contact-${number}@customers.example`,
      lifecycleStage: lifecycleStage(random),
      campaign: campaigns[Math.floor(random() * campaigns.length)],
      estimatedValue: Math.round(account.annualRevenue * 0.01),
    };
  });
}

function insertStatement(rowCount: number, columns: number): string {
  return Array.from({ length: rowCount }, (_, row) => {
    const values = Array.from({ length: columns }, (_, column) => `$${row * columns + column + 1}`);
    values[7] += '::numeric';
    return `(${values.join(', ')})`;
  }).join(', ');
}

async function seed(): Promise<void> {
  const countArgument = process.argv.find((argument) => argument.startsWith('--count='));
  const customerCount = countArgument ? Number(countArgument.slice('--count='.length)) : DEFAULT_COUNT;
  const reset = process.argv.includes('--reset');
  if (!Number.isSafeInteger(customerCount) || customerCount < 1 || customerCount > 1_000_000) {
    throw new Error('--count must be a whole number between 1 and 1,000,000');
  }

  const benchmarkUrl = new URL('../data/census-2022-receipts.json', import.meta.url);
  const benchmark = JSON.parse(await readFile(fileURLToPath(benchmarkUrl), 'utf8')) as Benchmark;
  for (const industry of benchmark.industries) {
    const firmTotal = industry.bands.reduce((sum, band) => sum + band.firms, 0);
    const receiptsTotal = industry.bands.reduce((sum, band) => sum + band.receiptsThousands, 0);
    if (firmTotal !== industry.firms || receiptsTotal !== industry.receiptsThousands) {
      throw new Error(`Receipt benchmark totals do not match for NAICS ${industry.naics}`);
    }
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://crm_app:local_only_change_me@localhost:5432/lifecycle_crm',
  });
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM customers');
    if (Number(rows[0].count) > 0 && !reset) {
      throw new Error(`Database already contains ${rows[0].count} customers. Pass --reset to replace demo data.`);
    }

    const customers = buildCustomers(benchmark, customerCount);
    await client.query('BEGIN');
    if (reset) await client.query('DELETE FROM customers');

    const savedCustomers: { id: string; email: string; lifecycle_stage: Stage }[] = [];
    for (let start = 0; start < customers.length; start += BATCH_SIZE) {
      const batch = customers.slice(start, start + BATCH_SIZE);
      const params: unknown[] = [];
      for (const customer of batch) {
        params.push(customer.name, customer.company, customer.email, customer.lifecycleStage,
          customer.campaign, customer.estimatedValue, customer.industryCode, customer.annualRevenue);
      }
      const { rows: inserted } = await client.query(
        `INSERT INTO customers (name, company, email, lifecycle_stage, campaign, estimated_value, industry_code, annual_revenue)
         VALUES ${insertStatement(batch.length, 8)} RETURNING id, email, lifecycle_stage`,
        params,
      );
      savedCustomers.push(...inserted);
      if (start % 5_000 === 0) console.log(`Inserted ${Math.min(start + batch.length, customers.length).toLocaleString()} / ${customerCount.toLocaleString()} customer profiles`);
    }

    const customerByEmail = new Map(customers.map((customer) => [customer.email, customer]));
    const eventBatchSize = 500;
    const eventRows: { customerId: string; department: string; action: string; fromStage: string | null; toStage: string; details: string }[] = [];
    const orderRows: { customerId: string; status: string; amount: number }[] = [];
    for (const saved of savedCustomers) {
      const customer = customerByEmail.get(saved.email)!;
      const history = lifecycleHistory[saved.lifecycle_stage];
      history.forEach((toStage, historyIndex) => {
        const action = actionByStage[toStage];
        eventRows.push({
          customerId: saved.id,
          department: action.department,
          action: historyIndex === 0 ? 'sample_profile_created' : action.action,
          fromStage: historyIndex === 0 ? null : history[historyIndex - 1],
          toStage,
          details: JSON.stringify({ source: 'synthetic_demo', naics: customer.industryCode, receiptBand: customer.band.label }),
        });
      });
      if (['awaiting_delivery', 'active_customer', 'renewal_due'].includes(saved.lifecycle_stage)) {
        orderRows.push({ customerId: saved.id, status: saved.lifecycle_stage === 'awaiting_delivery' ? 'in_fulfillment' : 'delivered', amount: customer.estimatedValue });
      }
    }

    for (let start = 0; start < eventRows.length; start += eventBatchSize) {
      const batch = eventRows.slice(start, start + eventBatchSize);
      const params: unknown[] = [];
      const values = batch.map((event, index) => {
        const offset = index * 6;
        params.push(event.customerId, event.department, event.action, event.fromStage, event.toStage, event.details);
        return `($${offset + 1}::uuid, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::jsonb)`;
      });
      await client.query(
        `INSERT INTO lifecycle_events (customer_id, department, action, from_stage, to_stage, details) VALUES ${values.join(', ')}`,
        params,
      );
    }

    for (let start = 0; start < orderRows.length; start += eventBatchSize) {
      const batch = orderRows.slice(start, start + eventBatchSize);
      const params: unknown[] = [];
      const values = batch.map((order, index) => {
        const offset = index * 3;
        params.push(order.customerId, order.status, order.amount);
        return `($${offset + 1}::uuid, $${offset + 2}, $${offset + 3}::numeric)`;
      });
      await client.query(`INSERT INTO orders (customer_id, status, amount) VALUES ${values.join(', ')}`, params);
    }

    await client.query('COMMIT');
    const summary = customers.reduce((result, customer) => {
      result[customer.industryCode] = result[customer.industryCode] ?? { count: 0, annualRevenue: 0 };
      result[customer.industryCode].count += 1;
      result[customer.industryCode].annualRevenue += customer.annualRevenue;
      return result;
    }, {} as Record<string, { count: number; annualRevenue: number }>);
    console.log(`Seeded ${customerCount.toLocaleString()} synthetic CRM customers from 2022 Census receipt-size bands.`);
    for (const industry of benchmark.industries) {
      const industrySummary = summary[industry.naics];
      console.log(`${industry.naics} ${industry.name}: ${industrySummary.count.toLocaleString()} accounts, ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(industrySummary.annualRevenue)} sample annual revenue`);
    }
    console.log(`Created ${eventRows.length.toLocaleString()} lifecycle history records and ${orderRows.length.toLocaleString()} order tickets.`);
    console.log('All contact names and companies are synthetic; email addresses use the reserved .example domain.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
