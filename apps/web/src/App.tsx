import { useCallback, useEffect, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Boxes, BriefcaseBusiness,
  Check, ChevronDown, CircleHelp, Command, Compass, Filter,
  Gauge, LayoutDashboard, Megaphone, MoreHorizontal, Plus, Search, Send, Settings2,
  ShieldCheck, Truck, UserRound, UsersRound, X,
} from 'lucide-react';

type Department = 'marketing' | 'inside-sales' | 'sales' | 'ordering' | 'delivery' | 'retention';
type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  lifecycleStage: string;
  campaign: string;
  estimatedValue: number | string;
  annualRevenue: number | string;
  industryCode: string;
  updatedAt: string;
};
type EventItem = {
  id: number;
  customerId: string;
  customerName: string;
  department: string;
  action: string;
  fromStage?: string;
  toStage: string;
  createdAt: string;
};
type NotificationItem = {
  id: number;
  customerName: string;
  targetDepartment: string;
  message: string;
  createdAt: string;
  readAt?: string;
};
type Dashboard = {
  countByStage: Record<string, number>;
  funnelByStage: Record<string, number>;
  totalCustomers: number;
  totalAnnualRevenue: number | string;
  pipelineValue: number | string;
  revenueDistribution: { industryCode: string; band: string; count: number; revenue: number | string }[];
};
type DepartmentInfo = {
  id: Department;
  label: string;
  short: string;
  title: string;
  description: string;
  icon: typeof Megaphone;
  action: string;
  actionLabel: string;
  secondary?: { action: string; label: string };
  stage: string;
};

const departments: DepartmentInfo[] = [
  { id: 'marketing', label: 'Marketing', short: 'MK', title: 'Campaign & lead generation', description: 'Build demand, track engagement, and hand warm leads to the right team.', icon: Megaphone, action: 'engage_lead', actionLabel: 'Mark engaged', stage: 'new_lead' },
  { id: 'inside-sales', label: 'Inside sales', short: 'IS', title: 'Qualification & first contact', description: 'Respond to interested prospects and qualify the opportunity.', icon: UserRound, action: 'qualify', actionLabel: 'Qualify lead', secondary: { action: 'disqualify', label: 'Disqualify' }, stage: 'warm_lead' },
  { id: 'sales', label: 'Actual sales', short: 'AS', title: 'Deal closing & contracting', description: 'Move qualified opportunities to a signed agreement.', icon: BriefcaseBusiness, action: 'close_won', actionLabel: 'Close won', secondary: { action: 'close_lost', label: 'Close lost' }, stage: 'qualified' },
  { id: 'ordering', label: 'Ordering', short: 'OR', title: 'Order processing & allocation', description: 'Create an order ticket and pass a verified request to fulfillment.', icon: Boxes, action: 'create_order', actionLabel: 'Create order', stage: 'closed_won' },
  { id: 'delivery', label: 'Delivering', short: 'DL', title: 'Logistics & fulfillment', description: 'Track delivery and confirm receipt against the customer record.', icon: Truck, action: 'mark_delivered', actionLabel: 'Confirm delivery', stage: 'awaiting_delivery' },
  { id: 'retention', label: 'Account retention', short: 'AR', title: 'Renewal & re-engagement', description: 'Protect customer value and create the next lifecycle opportunity.', icon: UsersRound, action: 'start_renewal', actionLabel: 'Start renewal', secondary: { action: 'cross_sell', label: 'Create cross-sell lead' }, stage: 'active_customer' },
];

const stageLabels: Record<string, string> = {
  new_lead: 'New lead', warm_lead: 'Warm lead', qualified: 'Qualified', closed_won: 'Closed won',
  closed_lost: 'Closed lost', renewal_due: 'Renewal due', awaiting_delivery: 'Awaiting delivery', active_customer: 'Active customer',
};
const money = (amount: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(amount) || 0);
const numberFormat = new Intl.NumberFormat('en-US');
const timeAgo = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

function App() {
  const [departmentId, setDepartmentId] = useState<Department>('marketing');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [queue, setQueue] = useState<Customer[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueOffset, setQueueOffset] = useState(0);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', company: '', email: '', campaign: 'Fall product launch', estimatedValue: '' });

  const department = departments.find((item) => item.id === departmentId)!;
  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [dashboardData, queueData, eventData, notificationData] = await Promise.all([
        request<Dashboard>('/api/dashboard'),
        request<{ customers: Customer[]; total: number }>(`/api/${departmentId}/queue?limit=50&offset=${queueOffset}&search=${encodeURIComponent(query)}`),
        request<{ events: EventItem[] }>('/api/events'),
        request<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setDashboard(dashboardData);
      setQueue(queueData.customers);
      setQueueTotal(queueData.total);
      setEvents(eventData.events);
      setNotifications(notificationData.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the workspace');
    } finally {
      setLoading(false);
    }
  }, [departmentId, query, queueOffset]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void request<{ notifications: NotificationItem[] }>('/api/notifications')
        .then((data) => setNotifications(data.notifications))
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredQueue = queue;
  const pipeline = departments.map((item) => ({
    ...item,
    count: item.id === 'ordering'
      ? (dashboard?.countByStage.closed_won ?? 0) + (dashboard?.countByStage.renewal_due ?? 0)
      : dashboard?.countByStage[item.stage] ?? 0,
  }));
  const closeRate = dashboard && dashboard.funnelByStage.new_lead
    ? Math.round(((dashboard.funnelByStage.closed_won ?? 0) / dashboard.funnelByStage.new_lead) * 100)
    : 0;

  async function performAction(customer: Customer, action: string) {
    setBusyId(customer.id);
    setNotice('');
    try {
      await request(`/api/${departmentId}/actions`, { method: 'POST', body: JSON.stringify({ action, customerId: customer.id }) });
      setNotice(`${customer.name} moved to ${stageLabels[action === 'engage_lead' ? 'warm_lead' : action === 'qualify' ? 'qualified' : action === 'close_won' ? 'closed_won' : action === 'close_lost' || action === 'disqualify' ? 'closed_lost' : action === 'create_order' ? 'awaiting_delivery' : action === 'mark_delivered' ? 'active_customer' : action === 'start_renewal' ? 'renewal_due' : 'new_lead']}.`);
      await loadData(false);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Action could not be completed');
    } finally {
      setBusyId('');
    }
  }

  async function captureLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId('new-lead');
    try {
      await request('/api/marketing/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'capture_lead', ...form, estimatedValue: Number(form.estimatedValue) || 0 }),
      });
      setForm({ name: '', company: '', email: '', campaign: 'Fall product launch', estimatedValue: '' });
      setShowLeadForm(false);
      setNotice('Lead captured and added to the marketing queue.');
      await loadData(false);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Lead could not be created');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Continuum CRM home">
          <span className="brand-mark"><Command size={19} strokeWidth={2.5} /></span>
          <span className="brand-name">continuum<span>CRM</span></span>
        </a>
        <div className="workspace-switch"><span className="workspace-icon">N</span><span className="workspace-copy"><strong>Northstar Group</strong><small>Enterprise workspace</small></span><ChevronDown size={15} /></div>
        <div className="nav-caption">WORKSPACE</div>
        <button className="nav-link active"><LayoutDashboard size={17} /><span>Overview</span></button>
        <button className="nav-link" onClick={() => setDepartmentId('marketing')}><Compass size={17} /><span>Lifecycle board</span></button>
        <div className="nav-caption departments-caption">DEPARTMENTS <button aria-label="Department settings"><Settings2 size={14} /></button></div>
        <nav className="department-nav" aria-label="Departments">
          {departments.map((item) => {
            const DepartmentIcon = item.icon;
            const isSelected = item.id === departmentId;
            return <button key={item.id} className={`nav-link department-link ${isSelected ? 'selected' : ''}`} onClick={() => setDepartmentId(item.id)} aria-current={isSelected ? 'page' : undefined}>
              <DepartmentIcon size={16} /><span>{item.label}</span><span className="nav-count">{dashboard?.countByStage[item.stage] ?? 0}</span>
            </button>;
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="upgrade-card"><div className="upgrade-orb"><ShieldCheck size={17} /></div><strong>Lifecycle, connected.</strong><p>One customer record from first touch to renewal.</p><button onClick={() => setDepartmentId('retention')}>Explore retention <ArrowRight size={14} /></button></div>
        <button className="nav-link muted"><CircleHelp size={17} /><span>Help center</span></button>
        <div className="profile-row"><div className="avatar user-avatar">AM</div><span className="profile-name"><strong>Alex Morgan</strong><small>CRM Administrator</small></span><MoreHorizontal size={18} /></div>
      </aside>

      <main className="main-area" id="top">
        <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>{department.label}</strong></div><div className="top-actions"><label className="global-search"><Search size={16} /><input placeholder="Search customers..." value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search customers" /><kbd>⌘ K</kbd></label><button className="icon-button" aria-label="Notifications" aria-expanded={showNotifications} onClick={() => setShowNotifications(!showNotifications)}><Bell size={18} />{notifications.length > 0 && <i />}</button><div className="top-avatar">AM</div></div>{showNotifications && <section className="notification-popover" aria-label="Handoff notifications"><div className="notification-heading"><strong>Handoff notifications</strong><button onClick={() => setShowNotifications(false)} aria-label="Close notifications"><X size={14} /></button></div>{notifications.length === 0 ? <p className="notification-empty">No handoffs yet. Workflow changes will appear here.</p> : notifications.slice(0, 8).map((item) => <article className="notification-item" key={item.id}><span className="notification-mark"><Send size={13} /></span><span><strong>{item.customerName}</strong><small>{item.message}</small><small>{timeAgo(item.createdAt)}</small></span></article>)}</section>}</header>
        <div className="content-wrap">
          <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot" /> CUSTOMER LIFECYCLE <span className="eyebrow-divider">/</span> {department.label.toUpperCase()}</div><h1>{department.title}</h1><p className="welcome-copy">{department.description}</p></div><div className="welcome-actions"><button className="subtle-button" onClick={() => void loadData()}><Activity size={15} /> Refresh</button>{departmentId === 'marketing' && <button className="primary-button" onClick={() => setShowLeadForm(true)}><Plus size={17} /> Capture lead</button>}</div></section>

          {notice && <div className="notice" role="status"><Check size={16} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}
          {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void loadData()}>Retry</button></div>}

          <section className="metrics-grid" aria-label="Lifecycle metrics">
            <MetricCard label="Total customer profiles" value={String(dashboard?.totalCustomers ?? '—')} change="Unified CRM" icon={<UsersRound size={17} />} tone="purple" trend="up" />
            <MetricCard label="Portfolio annual revenue" value={dashboard ? money(dashboard.totalAnnualRevenue) : '—'} change="Synthetic account data" icon={<Gauge size={17} />} tone="blue" trend="up" />
            <MetricCard label="Lead-to-close" value={dashboard ? `${closeRate}%` : '—'} change="Current cohort" icon={<ArrowUpRight size={17} />} tone="green" trend="up" />
            <MetricCard label="Awaiting delivery" value={String(dashboard?.countByStage.awaiting_delivery ?? '—')} change="Fulfillment queue" icon={<Truck size={17} />} tone="orange" trend="flat" />
          </section>

          <section className="pipeline-panel panel">
            <div className="panel-heading"><div><div className="section-kicker">END-TO-END CUSTOMER FLOW</div><h2>Lifecycle pipeline</h2></div><button className="text-button" onClick={() => setDepartmentId('marketing')}>View all profiles <ArrowRight size={15} /></button></div>
            <div className="pipeline-track">{pipeline.map((item, index) => {
              const StageIcon = item.icon;
              return <div key={item.id} className={`pipeline-stage ${departmentId === item.id ? 'pipeline-current' : ''}`}>
                <button className="stage-button" onClick={() => setDepartmentId(item.id)} aria-label={`${item.label}: ${item.count} records`}><span className="stage-icon"><StageIcon size={16} /></span><span className="stage-copy"><strong>{item.count}</strong><small>{item.label}</small></span></button>
                {index < pipeline.length - 1 && <span className="stage-connector"><ArrowRight size={14} /></span>}
              </div>;
            })}</div>
            <div className="pipeline-footer"><span><span className="legend-dot dot-purple" />Active lifecycle records</span><span><span className="legend-dot dot-gray" />Department handoff updates the shared customer profile</span><span className="pipeline-total">{dashboard?.totalCustomers ?? 0} profiles</span></div>
          </section>

          {dashboard && <RevenueDistribution rows={dashboard.revenueDistribution} totalCustomers={dashboard.totalCustomers} totalRevenue={dashboard.totalAnnualRevenue} />}

          <div className="lower-grid">
            <section className="queue-panel panel">
              <div className="panel-heading queue-heading"><div><div className="section-kicker">{department.label.toUpperCase()} WORKSPACE</div><h2>Department queue <span className="queue-badge">{filteredQueue.length}</span></h2></div><button className="filter-button" aria-label="Filter queue"><Filter size={15} /> Filter <ChevronDown size={13} /></button></div>
              <div className="queue-toolbar"><span>Customer / industry</span><span>Campaign / annual revenue</span><span>Stage</span><span>Next action</span></div>
              {loading ? <div className="empty-state">Loading lifecycle records...</div> : filteredQueue.length === 0 ? <div className="empty-state"><span className="empty-icon"><Search size={19} /></span><strong>{query ? 'No matching customers' : 'Queue is clear'}</strong><span>{query ? 'Try a different search.' : 'New records will appear here when they reach this stage.'}</span>{departmentId === 'marketing' && !query && <button className="primary-button small" onClick={() => setShowLeadForm(true)}><Plus size={15} /> Capture first lead</button>}</div> : <div className="customer-list">{filteredQueue.map((customer) => <CustomerRow key={customer.id} customer={customer} department={department} busy={busyId === customer.id} onAction={(action) => void performAction(customer, action)} />)}</div>}
              <div className="queue-footer"><span>Showing {queueTotal === 0 ? 0 : queueOffset + 1}–{Math.min(queueOffset + filteredQueue.length, queueTotal)} of {numberFormat.format(queueTotal)} records</span><button className="pagination-button" disabled={queueOffset === 0 || loading} onClick={() => setQueueOffset(Math.max(0, queueOffset - 50))}>Previous</button><button className="pagination-button" disabled={queueOffset + filteredQueue.length >= queueTotal || loading} onClick={() => setQueueOffset(queueOffset + 50)}>Next</button></div>
            </section>

            <aside className="activity-panel panel"><div className="panel-heading"><div><div className="section-kicker">SYSTEM OF RECORD</div><h2>Recent activity</h2></div><button className="icon-button plain" aria-label="Activity options"><MoreHorizontal size={19} /></button></div>
              <div className="activity-list">{events.slice(0, 6).map((item) => {
                const eventDepartment = departments.find((entry) => entry.id === item.department);
                return <div className="activity-item" key={item.id}><span className={`activity-dot ${eventDepartment?.id ?? 'marketing'}`} /><div className="activity-copy"><p><strong>{item.customerName}</strong> <span>{eventDescription(item.action)}</span></p><small>{eventDepartment?.label ?? item.department} <span>·</span> {timeAgo(item.createdAt)}</small></div></div>;
              })}{!loading && events.length === 0 && <div className="activity-empty">Workflow changes will be recorded here.</div>}</div>
              <button className="activity-all" onClick={() => void loadData()}>View activity log <ArrowRight size={14} /></button>
            </aside>
          </div>

          <footer className="app-footer"><span>Continuum CRM <span>·</span> Unified lifecycle workspace</span><span><span className="connected-dot" /> All services operational</span></footer>
        </div>
      </main>

      {showLeadForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLeadForm(false); }}><section className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-title"><div className="modal-header"><div><div className="section-kicker">MARKETING INTAKE</div><h2 id="lead-title">Capture a new lead</h2><p>New profiles enter the unified lifecycle at Marketing.</p></div><button className="icon-button plain" onClick={() => setShowLeadForm(false)} aria-label="Close"><X size={18} /></button></div><form onSubmit={(event) => void captureLead(event)}><label>Contact name<input required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Sam Rivera" /></label><div className="form-two"><label>Company<input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Company name" /></label><label>Email address<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="sam@company.com" /></label></div><div className="form-two"><label>Campaign<input value={form.campaign} onChange={(event) => setForm({ ...form, campaign: event.target.value })} placeholder="Campaign name" /></label><label>Estimated value<input type="number" min="0" value={form.estimatedValue} onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })} placeholder="0" /></label></div><div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setShowLeadForm(false)}>Cancel</button><button className="primary-button" disabled={busyId === 'new-lead'}><Send size={15} />{busyId === 'new-lead' ? 'Saving...' : 'Create lead'}</button></div></form></section></div>}
    </div>
  );
}

function MetricCard({ label, value, change, icon, tone, trend }: { label: string; value: string; change: string; icon: React.ReactNode; tone: string; trend: 'up' | 'flat' }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-bottom"><strong>{value}</strong><span className={`metric-change ${trend}`}>{trend === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{change}</span></div></article>;
}

function RevenueDistribution({ rows, totalCustomers, totalRevenue }: { rows: Dashboard['revenueDistribution']; totalCustomers: number; totalRevenue: number | string }) {
  const bandOrder = ['Under $1M', '$1M–$4.99M', '$5M–$9.99M', '$10M–$24.99M', '$25M–$99.99M', '$100M+'];
  const byBand = new Map(bandOrder.map((band) => [band, { band, count: 0, revenue: 0 }]));
  for (const row of rows) {
    const item = byBand.get(row.band);
    if (item) {
      item.count += row.count;
      item.revenue += Number(row.revenue);
    }
  }
  return <section className="revenue-panel panel" aria-label="Account annual revenue distribution">
    <div className="panel-heading"><div><div className="section-kicker">2022 CENSUS RECEIPTS-SIZE BENCHMARK</div><h2>Account revenue distribution</h2></div><span className="revenue-source-tag">Synthetic sample · {numberFormat.format(totalCustomers)} accounts</span></div>
    <p className="revenue-description">Small accounts are numerous; the largest firms account for a disproportionate share of industry receipts.</p>
    <div className="revenue-chart">{bandOrder.map((band) => {
      const item = byBand.get(band)!;
      const accountShare = totalCustomers ? item.count / totalCustomers : 0;
      const revenueShare = Number(totalRevenue) ? item.revenue / Number(totalRevenue) : 0;
      return <div className="revenue-row" key={band}><div className="revenue-band-label">{band}</div><div className="revenue-bars"><div className="revenue-bar-line"><span className="revenue-bar-count" style={{ width: `${Math.max(accountShare * 100, item.count ? 1 : 0)}%` }} /></div><div className="revenue-bar-legend"><span>{numberFormat.format(item.count)} accounts ({(accountShare * 100).toFixed(1)}%)</span><strong>{(revenueShare * 100).toFixed(1)}% of revenue</strong></div></div></div>;
    })}</div>
    <div className="revenue-footer"><span>Combined sample receipts: <strong>{money(totalRevenue)}</strong></span><span>Revenue per company, annualized</span></div>
  </section>;
}

function CustomerRow({ customer, department, busy, onAction }: { customer: Customer; department: DepartmentInfo; busy: boolean; onAction: (action: string) => void }) {
  const initials = customer.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const avatarColor = ['lavender', 'peach', 'mint', 'sky'][customer.name.length % 4];
  const industryLabel = customer.industryCode === '337910' ? 'Mattress manufacturing' : 'Furniture and mattress retail';
  return <article className="customer-row"><div className="customer-cell"><span className={`avatar ${avatarColor}`}>{initials}</span><span className="customer-ident"><strong>{customer.name}</strong><small>{customer.company || customer.email} · {industryLabel}</small></span></div><div className="campaign-cell"><span>{customer.campaign || 'Direct inquiry'}</span><small>{money(customer.annualRevenue)} annual revenue</small></div><div><span className={`stage-pill ${customer.lifecycleStage}`}><i />{stageLabels[customer.lifecycleStage] ?? customer.lifecycleStage}</span></div><div className="row-actions"><button className="row-action" disabled={busy} onClick={() => onAction(department.action)}>{busy ? 'Saving...' : department.actionLabel}<ArrowRight size={13} /></button>{department.secondary && <button className="more-action" disabled={busy} title={department.secondary.label} onClick={() => onAction(department.secondary!.action)}><MoreHorizontal size={17} /></button>}</div></article>;
}

function eventDescription(action: string) {
  const descriptions: Record<string, string> = {
    capture_lead: 'captured a new lead', engage_lead: 'marked lead as engaged', qualify: 'qualified the opportunity',
    disqualify: 'disqualified the lead', close_won: 'closed the deal as won', close_lost: 'closed the deal as lost',
    create_order: 'created an order ticket', mark_delivered: 'confirmed delivery', start_renewal: 'started a renewal', cross_sell: 'created a cross-sell lead',
  };
  return descriptions[action] ?? action.replaceAll('_', ' ');
}

export default App;
