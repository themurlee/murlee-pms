import { useMemo } from 'react';
import { useDashboardStats } from '../../hooks/useDashboardStats';

// ---- "Needs you today" triage feed --------------------------------------
// Illustrative mock — a ranked action queue is not yet built on the backend.
type Sev = 'critical' | 'serious' | 'warning';
type TriageItem = {
  id: string; sev: Sev; kind: string; who: string; unit: string;
  detail: string; meta?: string; dollarLabel: string; action: string;
};

const SEV_SPINE: Record<Sev, string> = {
  critical: 'bg-rose-500', serious: 'bg-orange-500', warning: 'bg-amber-500',
};
const SEV_TEXT: Record<Sev, string> = {
  critical: 'text-rose-400', serious: 'text-orange-400', warning: 'text-amber-400',
};
const SEV_LABEL: Record<Sev, string> = {
  critical: 'Critical', serious: 'Needs action', warning: 'Watch',
};

const TRIAGE: TriageItem[] = [
  { id: 't1', sev: 'critical', kind: 'RENT', who: 'Jane Doe', unit: 'Oakridge #101',
    detail: '34 days late', meta: 'Voucher: Fulton County HA', dollarLabel: '$1,800 + $150 late', action: 'Send late notice' },
  { id: 't2', sev: 'critical', kind: 'FIX', who: 'No hot water', unit: 'Oakridge #105',
    detail: 'Emergency · reported 2h ago', meta: 'Unassigned', dollarLabel: 'SLA breach risk', action: 'Assign vendor' },
  { id: 't3', sev: 'serious', kind: 'ACH', who: 'Alice Cooper', unit: 'Oakridge #102',
    detail: 'ACH returned — R01 insufficient funds', meta: 'Auto-pay', dollarLabel: '$1,500 bounced', action: 'Retry & contact' },
  { id: 't4', sev: 'serious', kind: 'VACANT', who: 'Vacant unit', unit: 'Oakridge #108',
    detail: 'Empty 18 days', meta: 'Lost rent accruing', dollarLabel: '–$1,450 / mo', action: 'List unit' },
  { id: 't5', sev: 'serious', kind: 'ACH', who: 'Bob Marley', unit: 'Pacific Hts #12',
    detail: 'Payment plan installment missed', meta: 'Promised Friday', dollarLabel: '$966 due', action: 'Call tenant' },
  { id: 't6', sev: 'warning', kind: 'LEASE', who: 'John Smith', unit: 'Pacific Hts #4',
    detail: 'Lease ends in 22 days', meta: 'No renewal sent', dollarLabel: '$1,350 / mo at stake', action: 'Send renewal' },
  { id: 't7', sev: 'warning', kind: 'FIX', who: 'Leaky faucet', unit: 'Oakridge #101',
    detail: 'Work order open 9 days', meta: 'In progress', dollarLabel: 'Aging WO', action: 'Follow up' },
];

const TriageRow = ({ t }: { t: TriageItem }) => (
  <div className="flex items-stretch rounded-2xl glass-card overflow-hidden">
    <div className={`w-1 shrink-0 ${SEV_SPINE[t.sev]}`} />
    <div className="flex-1 flex items-center justify-between gap-4 py-3.5 pl-4 pr-3.5 min-w-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-extrabold tracking-wider text-slate-400 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 font-mono">{t.kind}</span>
          <span className="text-white font-bold text-sm truncate">{t.who}</span>
          <span className="text-slate-500 text-xs font-mono">{t.unit}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${SEV_TEXT[t.sev]}`}>{t.detail}</span>
          {t.meta && <span className="text-slate-500 text-xs">· {t.meta}</span>}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right hidden sm:block">
          <div className="text-white font-bold text-sm text-outfit tracking-tight">{t.dollarLabel}</div>
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{SEV_LABEL[t.sev]}</div>
        </div>
        <button className="bg-white text-slate-900 text-xs font-bold rounded-lg px-3.5 py-2 whitespace-nowrap hover:bg-slate-200 transition-all">
          {t.action}
        </button>
      </div>
    </div>
  </div>
);

// ---- DoorLoop-inspired: money-in feed, landlord tasks, data hygiene ------
// Illustrative mock — none wired to the backend yet.
type Payment = { id: string; who: string; unit: string; amount: number; method: string; when: string };
const RECENT_PAYMENTS: Payment[] = [
  { id: 'p1', who: 'John Smith', unit: 'Pacific Hts #4', amount: 1350, method: 'ACH', when: '2h ago' },
  { id: 'p2', who: 'Sarah Lee', unit: 'Oakridge #103', amount: 1450, method: 'ACH', when: 'Yesterday' },
  { id: 'p3', who: 'Mike Ross', unit: 'Pacific Hts #7', amount: 1600, method: 'Card', when: '2 days ago' },
  { id: 'p4', who: 'David Kim', unit: 'Oakridge #104', amount: 1400, method: 'ACH', when: '3 days ago' },
];

type Task = { id: string; label: string; context: string; due: string; done: boolean };
const TASKS: Task[] = [
  { id: 'k1', label: 'Schedule annual inspection', context: 'Oakridge #101', due: 'Fri', done: false },
  { id: 'k2', label: 'Renew landlord insurance', context: 'Portfolio', due: 'Jul 30', done: false },
  { id: 'k3', label: 'Sign renewal — John Smith', context: 'Pacific Hts #4', due: 'In 3 wks', done: false },
  { id: 'k4', label: 'Order smoke detectors', context: 'Oakridge #105', due: 'No date', done: true },
];

const HYGIENE = ['2 tenants missing a phone number', "3 haven't activated the tenant portal", '1 renewal lease unsigned'];

const initials = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

const PaymentsWidget = () => (
  <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
    <div className="flex items-baseline justify-between">
      <h3 className="text-lg font-bold text-white text-outfit">Recent payments received</h3>
      <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
        +${RECENT_PAYMENTS.reduce((s, p) => s + p.amount, 0).toLocaleString()} this week
      </span>
    </div>
    <div className="flex flex-col gap-3">
      {RECENT_PAYMENTS.map(p => (
        <div key={p.id} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0">{initials(p.who)}</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{p.who}</div>
              <div className="text-xs text-slate-500 font-mono">{p.unit} · {p.method}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-bold text-emerald-400 tabular-nums">+${p.amount.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">{p.when}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const TasksWidget = () => (
  <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
    <div className="flex items-baseline justify-between">
      <h3 className="text-lg font-bold text-white text-outfit">Your tasks</h3>
      <span className="text-xs text-slate-400">{TASKS.filter(t => !t.done).length} open</span>
    </div>
    <div className="flex flex-col gap-2.5">
      {TASKS.map(t => (
        <label key={t.id} className="flex items-center gap-3 cursor-pointer group">
          <input type="checkbox" defaultChecked={t.done} className="w-4 h-4 rounded bg-slate-900 border-white/15 text-indigo-500 focus:ring-indigo-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold truncate ${t.done ? 'text-slate-500 line-through' : 'text-white'}`}>{t.label}</div>
            <div className="text-xs text-slate-500">{t.context}</div>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${t.due === 'Fri' ? 'text-amber-400' : 'text-slate-500'}`}>{t.due}</span>
        </label>
      ))}
    </div>
  </div>
);

export const Dashboard = () => {
  const { data: stats } = useDashboardStats();

  // Mock data for graphs — cashflow trend is a time-series aggregation not
  // yet built on the backend (thin-slice scope); left as illustrative mock.
  const cashflowData = [12000, 14200, 11500, 16800, 15400, 18900];
  const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];

  // Net cashflow MTD not yet exposed by /dashboard/summary — illustrative mock.
  const netCashflowMTD = 9820;

  // Generate SVG path points for cashflow line chart
  const width = 500;
  const height = 150;
  const padding = 20;

  const { points, pathD, areaD } = useMemo(() => {
    const maxVal = Math.max(...cashflowData);
    const minVal = Math.min(...cashflowData);
    const pts = cashflowData.map((val, idx) => {
      const x = padding + (idx * (width - 2 * padding)) / (cashflowData.length - 1);
      const y = height - padding - ((val - minVal) * (height - 2 * padding)) / (maxVal - minVal);
      return { x, y };
    });
    const path = pts.reduce((acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');
    const area = `${path} L ${pts[pts.length - 1].x} ${height - padding} L ${pts[0].x} ${height - padding} Z`;
    return { points: pts, pathD: path, areaD: area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const occupancyPct = stats ? Math.round((stats.occupiedUnits / Math.max(stats.totalUnits, 1)) * 100) : 0;
  const collectionPct = stats ? Math.round(stats.rentCollectionRate * 100) : 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Dashboard Heading */}
      <div>
        <h1 className="text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
          Dashboard
        </h1>
        <p className="text-slate-400 text-sm mt-1">Aggregated portfolio financials and connected feeds</p>
      </div>
      
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Gross Monthly Income</span>
          <p className="text-2xl font-extrabold mt-3 text-emerald-400 text-outfit tracking-tight">${(stats?.grossMonthlyIncome ?? 0).toLocaleString()}</p>
          <span className="text-xs text-slate-500 mt-2">${(stats?.overdueTotal ?? 0).toLocaleString()} overdue</span>
        </div>

        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Occupied Units</span>
          <p className="text-2xl font-extrabold mt-3 text-indigo-400 text-outfit tracking-tight">{stats?.occupiedUnits ?? 0} / {stats?.totalUnits ?? 0}</p>
          <span className="text-xs text-slate-500 mt-2">{occupancyPct}% occupancy rate</span>
        </div>

        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Delinquency</span>
          <p className="text-2xl font-extrabold mt-3 text-rose-400 text-outfit tracking-tight">${(stats?.overdueTotal ?? 0).toLocaleString()}</p>
          <span className="text-xs text-slate-500 mt-2">Outstanding arrears · portfolio</span>
        </div>

        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Net Cashflow · MTD</span>
          <p className="text-2xl font-extrabold mt-3 text-white text-outfit tracking-tight">${netCashflowMTD.toLocaleString()}</p>
          <span className="text-xs text-slate-500 mt-2">Income − expenses</span>
        </div>

        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Plaid Connection Health</span>
          <div className="mt-3 flex items-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Active
            </span>
          </div>
          <span className="text-xs text-slate-500 mt-4">Synced 2 hours ago</span>
        </div>
      </div>

      {/* Visual Analytics Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cashflow Performance Area Chart */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-white text-outfit">Cashflow Trend</h3>
              <p className="text-xs text-slate-400">Monthly Net Profit (Feb - Jul 2026)</p>
            </div>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">+12.4% MoM</span>
          </div>

          <div className="relative w-full h-[160px] bg-slate-950/20 rounded-xl overflow-hidden border border-white/5 flex items-end">
            <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Background grid lines */}
              <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
              {/* Area path */}
              <path d={areaD} fill="url(#chartGradient)" />
              {/* Line path */}
              <path d={pathD} fill="none" stroke="rgb(99, 102, 241)" strokeWidth="3" />
              {/* Data points */}
              {points.map((p, idx) => (
                <circle 
                  key={idx} 
                  cx={p.x} 
                  cy={p.y} 
                  r="4" 
                  fill="rgb(99, 102, 241)" 
                  stroke="rgba(255, 255, 255, 0.8)" 
                  strokeWidth="2" 
                />
              ))}
            </svg>
          </div>

          <div className="flex justify-between text-[10px] font-semibold text-slate-400 px-2">
            {months.map((m, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <span>{m}</span>
                <span className="text-white mt-0.5">${(cashflowData[idx] / 1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rent Collection & Recent Transactions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Rent Collection Rate */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white text-outfit">Rent Collection</h3>
              <p className="text-xs text-slate-400">Current cycle completion</p>
            </div>
            
            <div className="flex items-center justify-center relative py-2">
              <svg className="w-24 h-24 transform -rotate-90">
                <circle 
                  cx="48" 
                  cy="48" 
                  r="38" 
                  stroke="rgba(255,255,255,0.05)" 
                  strokeWidth="8" 
                  fill="transparent" 
                />
                <circle 
                  cx="48" 
                  cy="48" 
                  r="38" 
                  stroke="rgb(16, 185, 129)" 
                  strokeWidth="8" 
                  fill="transparent" 
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset={`${2 * Math.PI * 38 * (1 - collectionPct / 100)}`}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-xl font-extrabold text-white text-outfit">{collectionPct}%</span>
                <span className="text-[8px] text-slate-400 block uppercase font-bold tracking-widest mt-0.5">Cleared</span>
              </div>
            </div>

            <div className="flex justify-between text-xs text-slate-400 font-semibold mt-2">
              <span>Paid: <strong className="text-emerald-400">$25,004</strong></span>
              <span>Pending: <strong className="text-amber-400">$1,596</strong></span>
            </div>
          </div>

          {/* Recent Transaction volume */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white text-outfit">Expenses vs Rent</h3>
              <p className="text-xs text-slate-400">Transaction split</p>
            </div>

            <div className="flex flex-col gap-4 mt-2">
              {/* Rent volume */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-semibold text-slate-300">
                  <span>Gross Rent</span>
                  <span className="text-emerald-400">$26,600</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '85%' }}></div>
                </div>
              </div>

              {/* Expense volume */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-semibold text-slate-300">
                  <span>Operating Expenses</span>
                  <span className="text-rose-400">$4,120</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: '15%' }}></div>
                </div>
              </div>
            </div>

            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-4">Synced from Plaid Feed</span>
          </div>
        </div>
      </div>

      {/* Triage (left) + money-in & tasks (right) — fills the full width */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Needs you today — triage feed (ranked action queue) */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-bold text-white text-outfit">Needs you today</h3>
          </div>

          {/* Data-hygiene nudge as the first line item (DoorLoop pattern) */}
          <div className="flex items-center gap-2 flex-wrap glass-card rounded-2xl px-4 py-3 text-xs">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-outfit text-[10px]">Setup</span>
            {HYGIENE.map((h, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{h}
              </span>
            ))}
            <button className="ml-auto text-indigo-400 hover:text-indigo-300 font-semibold">Fix now →</button>
          </div>

          {TRIAGE.map(t => <TriageRow key={t.id} t={t} />)}
          <button className="self-start mt-1 text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-colors">
            View all activity →
          </button>
        </div>

        {/* Right column: money-in + tasks (DoorLoop patterns) */}
        <div className="flex flex-col gap-6">
          <PaymentsWidget />
          <TasksWidget />
        </div>
      </div>
    </div>
  );
};
