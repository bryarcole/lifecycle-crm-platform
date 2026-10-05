import censusData from '../../../data/census-2022-receipts.json';

type Stage = 'new_lead' | 'warm_lead' | 'qualified' | 'closed_won' | 'closed_lost' | 'awaiting_delivery' | 'active_customer' | 'renewal_due';
type DemoDepartment = 'marketing' | 'inside-sales' | 'sales' | 'ordering' | 'delivery' | 'retention';
type ReceiptBand = { label: string; minDollars: number; maxDollars: number | null; firms: number; receiptsThousands: number };
type CensusIndustry = { naics: string; name: string; firms: number; receiptsThousands: number; bands: ReceiptBand[] };
type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  lifecycleStage: Stage;
  campaign: string;
  estimatedValue: number;
  annualRevenue: number;
  industryCode: string;
  updatedAt: string;
};
type DemoEvent = {
  id: number;
  customerId: string;
  customerName: string;
  department: string;
  action: string;
  fromStage?: Stage;
  toStage: Stage;
  details: Record<string, unknown>;
  createdAt: string;
};
type DemoNotification = {
  id: number;
  customerId: string;
  customerName: string;
  targetDepartment: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};
type DemoState = {
  stageOverrides: Record<string, Stage>;
  visitedStages: Record<string, Stage[]>;
  addedCustomers: Customer[];
  events: DemoEvent[];
  notifications: DemoNotification[];
  nextEventId: number;
};
type Transition = { department: DemoDepartment; from: Stage[]; to: Stage };

const TOTAL_CUSTOMERS = 25_000;
const STORAGE_KEY = 'continuum-github-pages-demo-v1';
const industries = censusData.industries as CensusIndustry[];
const stageCounts: Record<Stage, number> = {
  new_lead: 3_946,
  warm_lead: 3_061,
  qualified: 2_855,
  closed_won: 2_487,
  closed_lost: 698,
  awaiting_delivery: 2_447,
  active_customer: 7_477,
  renewal_due: 2_029,
};
const stageOrder = Object.keys(stageCounts) as Stage[];
const departmentQueues: Record<DemoDepartment, Stage[]> = {
  marketing: ['new_lead'],
  'inside-sales': ['warm_lead'],
  sales: ['qualified'],
  ordering: ['closed_won', 'renewal_due'],
  delivery: ['awaiting_delivery'],
  retention: ['active_customer'],
};
const departmentTransitions: Record<string, Transition> = {
  engage_lead: { department: 'marketing', from: ['new_lead'], to: 'warm_lead' },
  qualify: { department: 'inside-sales', from: ['warm_lead'], to: 'qualified' },
  disqualify: { department: 'inside-sales', from: ['warm_lead', 'qualified'], to: 'closed_lost' },
  close_won: { department: 'sales', from: ['qualified'], to: 'closed_won' },
  close_lost: { department: 'sales', from: ['qualified'], to: 'closed_lost' },
  create_order: { department: 'ordering', from: ['closed_won', 'renewal_due'], to: 'awaiting_delivery' },
  mark_delivered: { department: 'delivery', from: ['awaiting_delivery'], to: 'active_customer' },
  start_renewal: { department: 'retention', from: ['active_customer'], to: 'renewal_due' },
  cross_sell: { department: 'retention', from: ['active_customer'], to: 'new_lead' },
};
const names = ['Avery Johnson', 'Jordan Kim', 'Riley Patel', 'Casey Morgan', 'Taylor Reed', 'Quinn Rivera', 'Morgan Ellis', 'Sam Bennett', 'Jamie Brooks', 'Alex Chen', 'Drew Carter', 'Cameron Diaz', 'Harper Foster', 'Parker Gray', 'Reese Hall', 'Rowan Hayes', 'Kai Hughes', 'Finley Jackson', 'Elliot James', 'Charlie Lewis', 'Blake Martin', 'Jules Nguyen', 'Emerson Perry', 'Robin Ross'];
const companyRoots = ['Northstar', 'Juniper House', 'Clearwater', 'Atlas', 'Brightline', 'Pioneer', 'Redwood', 'Maple & Main', 'Summit', 'Willow Creek', 'Fieldstone', 'Lakeshore', 'Westward', 'Silverleaf', 'Cedar & Stone', 'Harborline'];
const campaigns = ['Fall product launch', 'Operations webinar', 'Trade partner referral', 'Regional dealer program', 'Sleep better launch', 'Hospitality sourcing'];

function apportion(total: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const exact = weights.map((value) => total * value / weightTotal);
  const counts = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let remainder = total - counts.reduce((sum, value) => sum + value, 0), index = 0; remainder > 0; remainder -= 1, index += 1) {
    counts[order[index].index] += 1;
  }
  return counts;
}

const industryCounts = apportion(TOTAL_CUSTOMERS, industries.map((industry) => industry.firms));
const industryRanges = industries.map((industry, industryIndex) => {
  const counts = apportion(industryCounts[industryIndex], industry.bands.map((band) => band.firms));
  let start = industryCounts.slice(0, industryIndex).reduce((sum, count) => sum + count, 0) + 1;
  const bands = industry.bands.map((band, bandIndex) => {
    const range = { band, start, end: start + counts[bandIndex] - 1 };
    start = range.end + 1;
    return range;
  });
  return { industry, start: industryCounts.slice(0, industryIndex).reduce((sum, count) => sum + count, 0) + 1, end: start - 1, bands };
});

function hash(value: number, salt: number): number {
  let number = Math.imul(value ^ salt, 0x45d9f3b);
  number = Math.imul(number ^ (number >>> 16), 0x45d9f3b);
  return ((number ^ (number >>> 16)) >>> 0) / 4_294_967_296;
}

function baseStage(index: number): Stage {
  const rank = (index * 7_919) % TOTAL_CUSTOMERS;
  let boundary = 0;
  for (const stage of stageOrder) {
    boundary += stageCounts[stage];
    if (rank < boundary) return stage;
  }
  return 'renewal_due';
}

function baseVisitedStages(stage: Stage): Stage[] {
  const paths: Record<Stage, Stage[]> = {
    new_lead: ['new_lead'],
    warm_lead: ['new_lead', 'warm_lead'],
    qualified: ['new_lead', 'warm_lead', 'qualified'],
    closed_won: ['new_lead', 'warm_lead', 'qualified', 'closed_won'],
    closed_lost: ['new_lead', 'warm_lead', 'qualified', 'closed_lost'],
    awaiting_delivery: ['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery'],
    active_customer: ['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery', 'active_customer'],
    renewal_due: ['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery', 'active_customer', 'renewal_due'],
  };
  return paths[stage];
}

function createCustomer(index: number): Customer {
  const range = industryRanges.find((candidate) => index >= candidate.start && index <= candidate.end)!;
  const localIndex = index - range.start + 1;
  const bandRange = range.bands.find((candidate) => localIndex >= candidate.start - range.start + 1 && localIndex <= candidate.end - range.start + 1)!;
  const { band } = bandRange;
  const publishedMean = band.receiptsThousands * 1_000 / band.firms;
  const mean = Math.max(band.minDollars, Math.min(band.maxDollars ?? Infinity, publishedMean));
  const spread = Math.min(mean - band.minDollars, band.maxDollars === null ? mean - band.minDollars : band.maxDollars - mean) * 0.72;
  const revenue = Math.max(band.minDollars, Math.min(band.maxDollars ?? Infinity, mean + (hash(index, 97) * 2 - 1) * spread));
  const manufacturing = range.industry.naics === '337910';
  const digits = String(index).padStart(5, '0');
  return {
    id: `demo-${digits}`,
    name: names[Math.floor(hash(index, 11) * names.length)],
    company: `${companyRoots[Math.floor(hash(index, 23) * companyRoots.length)]} ${manufacturing ? 'Sleep Products' : 'Home & Mattress'} ${digits}`,
    email: `contact-${digits}@customers.example`,
    lifecycleStage: baseStage(index),
    campaign: campaigns[Math.floor(hash(index, 31) * campaigns.length)],
    estimatedValue: Math.round(revenue * 0.01),
    annualRevenue: Math.round(revenue * 100) / 100,
    industryCode: range.industry.naics,
    updatedAt: new Date(Date.now() - Math.floor(hash(index, 41) * 120) * 60_000).toISOString(),
  };
}

const initialFunnel: Record<Stage, number> = {
  new_lead: TOTAL_CUSTOMERS,
  warm_lead: TOTAL_CUSTOMERS - stageCounts.new_lead,
  qualified: TOTAL_CUSTOMERS - stageCounts.new_lead - stageCounts.warm_lead,
  closed_won: stageCounts.closed_won + stageCounts.awaiting_delivery + stageCounts.active_customer + stageCounts.renewal_due,
  closed_lost: stageCounts.closed_lost,
  awaiting_delivery: stageCounts.awaiting_delivery + stageCounts.active_customer + stageCounts.renewal_due,
  active_customer: stageCounts.active_customer + stageCounts.renewal_due,
  renewal_due: stageCounts.renewal_due,
};

function emptyState(): DemoState {
  return { stageOverrides: {}, visitedStages: {}, addedCustomers: [], events: [], notifications: [], nextEventId: 1 };
}

function getState(): DemoState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...emptyState(), ...JSON.parse(stored) as Partial<DemoState> };
  } catch {
    // If browser storage is unavailable, this demo still works in memory for the current page session.
  }
  return emptyState();
}

let state = getState();

function saveState(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing quotas may prevent persistence; keep the current in-memory demo state.
  }
}

function baseCustomerStage(index: number): Stage {
  return baseStage(index);
}

function currentCustomer(id: string): Customer | undefined {
  const added = state.addedCustomers.find((customer) => customer.id === id);
  if (added) return added;
  const match = /^demo-(\d+)$/.exec(id);
  if (!match) return undefined;
  const customer = createCustomer(Number(match[1]));
  const override = state.stageOverrides[id];
  return override ? { ...customer, lifecycleStage: override, updatedAt: new Date().toISOString() } : customer;
}

function findCustomerIndex(id: string): number | undefined {
  const match = /^demo-(\d+)$/.exec(id);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 1 && index <= TOTAL_CUSTOMERS ? index : undefined;
}

function getDashboard() {
  const countByStage: Record<Stage, number> = { ...stageCounts };
  for (const [id, currentStage] of Object.entries(state.stageOverrides)) {
    const index = findCustomerIndex(id);
    if (index === undefined) continue;
    const originalStage = baseCustomerStage(index);
    countByStage[originalStage] -= 1;
    countByStage[currentStage] += 1;
  }
  for (const customer of state.addedCustomers) countByStage[customer.lifecycleStage] += 1;

  const funnelByStage: Record<Stage, number> = { ...initialFunnel };
  for (const [id, visited] of Object.entries(state.visitedStages)) {
    const index = findCustomerIndex(id);
    if (index === undefined) continue;
    const originallyVisited = new Set(baseVisitedStages(baseCustomerStage(index)));
    for (const stage of new Set(visited)) if (!originallyVisited.has(stage)) funnelByStage[stage] += 1;
  }
  funnelByStage.new_lead += state.addedCustomers.length;

  const revenueDistribution: { industryCode: string; band: string; count: number; revenue: number }[] = [];
  for (let industryIndex = 0; industryIndex < industries.length; industryIndex += 1) {
    const industry = industries[industryIndex];
    const targetIndustryCount = industryCounts[industryIndex];
    const bandCounts = apportion(targetIndustryCount, industry.bands.map((band) => band.firms));
    industry.bands.forEach((band, bandIndex) => {
      const mean = Math.max(band.minDollars, Math.min(band.maxDollars ?? Infinity, band.receiptsThousands * 1_000 / band.firms));
      const dashboardBand = mean < 1_000_000 ? 'Under $1M' : mean < 5_000_000 ? '$1M–$4.99M' : mean < 10_000_000 ? '$5M–$9.99M' : mean < 25_000_000 ? '$10M–$24.99M' : mean < 100_000_000 ? '$25M–$99.99M' : '$100M+';
      let row = revenueDistribution.find((entry) => entry.industryCode === industry.naics && entry.band === dashboardBand);
      if (!row) {
        row = { industryCode: industry.naics, band: dashboardBand, count: 0, revenue: 0 };
        revenueDistribution.push(row);
      }
      row.count += bandCounts[bandIndex];
      row.revenue += Math.round(mean * bandCounts[bandIndex] * 100) / 100;
    });
  }
  for (const customer of state.addedCustomers) {
    const band = customer.annualRevenue < 1_000_000 ? 'Under $1M' : customer.annualRevenue < 5_000_000 ? '$1M–$4.99M' : customer.annualRevenue < 10_000_000 ? '$5M–$9.99M' : customer.annualRevenue < 25_000_000 ? '$10M–$24.99M' : customer.annualRevenue < 100_000_000 ? '$25M–$99.99M' : '$100M+';
    const row = revenueDistribution.find((entry) => entry.industryCode === customer.industryCode && entry.band === band)!;
    row.count += 1;
    row.revenue += customer.annualRevenue;
  }
  const totalAnnualRevenue = revenueDistribution.reduce((sum, row) => sum + row.revenue, 0);
  return {
    countByStage,
    funnelByStage,
    totalCustomers: TOTAL_CUSTOMERS + state.addedCustomers.length,
    totalAnnualRevenue,
    pipelineValue: totalAnnualRevenue * 0.65,
    revenueDistribution,
  };
}

function getQueue(department: string, url: URL) {
  const stages = departmentQueues[department as DemoDepartment];
  if (!stages) throw new Error('Department not found');
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
  const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const matches: Customer[] = [];
  let total = 0;
  const accept = (customer: Customer) => {
    if (!stages.includes(customer.lifecycleStage)) return;
    if (search && !`${customer.name} ${customer.company} ${customer.email}`.toLowerCase().includes(search)) return;
    if (total >= offset && matches.length < limit) matches.push(customer);
    total += 1;
  };
  for (let index = 1; index <= TOTAL_CUSTOMERS; index += 1) accept(currentCustomer(`demo-${String(index).padStart(5, '0')}`)!);
  for (const customer of state.addedCustomers) accept(customer);
  return { department, customers: matches, total, limit, offset };
}

function targetDepartment(stage: Stage): DemoDepartment {
  if (stage === 'new_lead') return 'marketing';
  if (stage === 'warm_lead') return 'inside-sales';
  if (stage === 'qualified' || stage === 'closed_lost') return 'sales';
  if (stage === 'closed_won' || stage === 'renewal_due') return 'ordering';
  if (stage === 'awaiting_delivery') return 'delivery';
  return 'retention';
}

function recordEvent(customer: Customer, department: string, action: string, fromStage: Stage | undefined, toStage: Stage): void {
  const id = state.nextEventId++;
  const createdAt = new Date().toISOString();
  state.events.unshift({ id, customerId: customer.id, customerName: customer.name, department, action, fromStage, toStage, details: { source: 'browser_only_demo' }, createdAt });
  state.notifications.unshift({ id, customerId: customer.id, customerName: customer.name, targetDepartment: targetDepartment(toStage), message: `${customer.name} entered the ${targetDepartment(toStage)} queue`, createdAt, readAt: null });
  state.events = state.events.slice(0, 100);
  state.notifications = state.notifications.slice(0, 30);
}

export function resetDemoData(): void {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore storage restrictions. */ }
  window.location.reload();
}

export async function requestDemo<T>(path: string, options?: RequestInit): Promise<T> {
  const url = new URL(path, window.location.origin);
  const method = options?.method ?? 'GET';
  if (method === 'GET' && url.pathname === '/api/dashboard') return getDashboard() as T;
  if (method === 'GET' && url.pathname === '/api/events') {
    const customerId = url.searchParams.get('customerId');
    return { events: state.events.filter((event) => !customerId || event.customerId === customerId).slice(0, 100) } as T;
  }
  if (method === 'GET' && url.pathname === '/api/notifications') return { notifications: state.notifications.slice(0, 30) } as T;

  const queueMatch = /^\/api\/([^/]+)\/queue$/.exec(url.pathname);
  if (method === 'GET' && queueMatch) return getQueue(queueMatch[1], url) as T;

  const actionMatch = /^\/api\/([^/]+)\/actions$/.exec(url.pathname);
  if (method === 'POST' && actionMatch) {
    const department = actionMatch[1] as DemoDepartment;
    const body = JSON.parse(String(options?.body ?? '{}')) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    if (action === 'capture_lead' && department === 'marketing') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('A contact name and valid email address are required.');
      if (state.addedCustomers.some((customer) => customer.email === email)) throw new Error('A customer with this email already exists.');
      const id = `demo-new-${state.nextEventId}`;
      const customer: Customer = {
        id, name, company: String(body.company ?? '').trim(), email,
        lifecycleStage: 'new_lead', campaign: String(body.campaign ?? '').trim(),
        estimatedValue: Math.max(0, Number(body.estimatedValue) || 0), annualRevenue: 0,
        industryCode: '442110', updatedAt: new Date().toISOString(),
      };
      state.addedCustomers.push(customer);
      state.visitedStages[id] = ['new_lead'];
      recordEvent(customer, department, action, undefined, 'new_lead');
      saveState();
      return { customer } as T;
    }

    const transition = departmentTransitions[action];
    if (!transition) throw new Error('Unsupported workflow action.');
    if (transition.department !== department) throw new Error('Action is not available to this department.');
    const customerId = typeof body.customerId === 'string' ? body.customerId : '';
    const customer = currentCustomer(customerId);
    if (!customer) throw new Error('Customer not found.');
    if (!transition.from.includes(customer.lifecycleStage)) throw new Error(`Cannot perform ${action} while customer is ${customer.lifecycleStage}.`);
    const updated: Customer = { ...customer, lifecycleStage: transition.to, updatedAt: new Date().toISOString() };
    if (state.addedCustomers.some((entry) => entry.id === customerId)) {
      state.addedCustomers = state.addedCustomers.map((entry) => entry.id === customerId ? updated : entry);
    } else {
      state.stageOverrides[customerId] = transition.to;
    }
    state.visitedStages[customerId] = [...new Set([...(state.visitedStages[customerId] ?? baseVisitedStages(baseCustomerStage(findCustomerIndex(customerId)!))), transition.to])];
    recordEvent(updated, department, action, customer.lifecycleStage, transition.to);
    saveState();
    return { customer: updated } as T;
  }
  throw new Error('This demo route is not available.');
}
