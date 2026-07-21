import { lazy, Suspense, useState } from 'react';
import { InvoiceList } from './components/Invoices/InvoiceList';
import { Login } from './components/Login/Login';
import { useAuth } from './hooks/useAuth';
import { useInvoices } from './hooks/useInvoices';
import { useInvoiceActions } from './hooks/useInvoiceActions';
import { Invoice } from './types/invoice';

const Dashboard = lazy(() => import('./components/Dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const Maintenance = lazy(() => import('./components/Maintenance/Maintenance').then(m => ({ default: m.Maintenance })));
const Properties = lazy(() => import('./components/Properties/Properties').then(m => ({ default: m.Properties })));
const Reports = lazy(() => import('./components/Reports/Reports').then(m => ({ default: m.Reports })));
const Tenants = lazy(() => import('./components/Tenants/Tenants').then(m => ({ default: m.Tenants })));
const Ledger = lazy(() => import('./components/Transactions/Ledger').then(m => ({ default: m.Ledger })));
const Communications = lazy(() => import('./components/Communications/Communications').then(m => ({ default: m.Communications })));
const Entities = lazy(() => import('./components/Entities/Entities').then(m => ({ default: m.Entities })));

type TabType = 'dashboard' | 'properties' | 'tenants' | 'entities' | 'maintenance' | 'communications' | 'reports' | 'rent_collection' | 'transactions';

const NAV_ITEMS: { tab: TabType; label: string; landlordOnly?: boolean }[] = [
  { tab: 'dashboard', label: 'Dashboard' },
  { tab: 'properties', label: 'Properties' },
  { tab: 'entities', label: 'Entities', landlordOnly: true },
  { tab: 'tenants', label: 'Tenants' },
  { tab: 'maintenance', label: 'Maintenance' },
  { tab: 'communications', label: 'Communications', landlordOnly: true },
  { tab: 'reports', label: 'Reports', landlordOnly: true },
  { tab: 'rent_collection', label: 'Rent Collection' },
  { tab: 'transactions', label: 'Transactions', landlordOnly: true },
];

function NavButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left px-4 py-3 rounded-xl capitalize font-semibold transition-all duration-200 text-outfit ${
        active ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [userRole, setUserRole] = useState<'landlord' | 'tenant'>('landlord');
  const [navOpen, setNavOpen] = useState(false); // mobile drawer

  const { data: invoices = [] } = useInvoices();
  const { markAsPaid, deleteInvoice } = useInvoiceActions();
  const [invoiceOverrides, setInvoiceOverrides] = useState<Record<string, Invoice>>({});

  const displayedInvoices = invoices.map(inv => invoiceOverrides[inv.id] ?? inv);

  const handleUpdateInvoice = (updated: Invoice) => {
    setInvoiceOverrides(prev => ({ ...prev, [updated.id]: updated }));
  };

  const handleRoleChange = (role: 'landlord' | 'tenant') => {
    setUserRole(role);
    if (role === 'tenant' && ['reports', 'transactions', 'entities', 'communications'].includes(activeTab)) {
      setActiveTab('dashboard');
    }
  };

  const selectTab = (tab: TabType) => { setActiveTab(tab); setNavOpen(false); };

  const visibleNav = NAV_ITEMS.filter(item => !item.landlordOnly || userRole === 'landlord');

  const sidebar = (
    <div className="h-full bg-slate-900/30 backdrop-blur-2xl border-r border-white/5 p-6 flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30 text-outfit">M</div>
        <span className="text-xl font-bold tracking-tight text-white text-outfit bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Murlee PMS</span>
      </div>

      <nav className="flex flex-col gap-1 overflow-y-auto">
        {visibleNav.map(item => (
          <NavButton key={item.tab} label={item.label} active={activeTab === item.tab} onClick={() => selectTab(item.tab)} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <span className="text-xs text-slate-500 truncate">{user?.email}</span>
        <button onClick={logout} className="text-left px-4 py-2 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-all text-outfit">
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-slate-950/20 text-slate-100 font-sans backdrop-blur-3xl">
      {/* Sidebar: static on lg+, slide-in drawer on mobile */}
      <aside className="hidden lg:block w-68 shrink-0">{sidebar}</aside>

      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-64 max-w-[80%] h-full animate-fadeIn">{sidebar}</div>
          <div className="flex-1 bg-slate-950/70 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
        </div>
      )}

      {/* Main Panel Content */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-4 sm:py-8">
        <div className="w-full max-w-[2400px] mx-auto flex flex-col gap-6 sm:gap-8">
          {/* Header: hamburger (mobile) + role selector */}
          <div className="flex justify-between items-center pb-4 border-b border-white/5 gap-3">
            <button onClick={() => setNavOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg text-slate-300 hover:bg-white/5" aria-label="Open menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
            </button>
            <span className="hidden sm:inline text-xs text-slate-500 font-bold uppercase tracking-widest text-outfit">Active Node: Sandbox Session</span>
            <div className="flex items-center gap-3 ml-auto">
              <span className="hidden sm:inline text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Access Role:</span>
              <select
                value={userRole}
                onChange={(e) => handleRoleChange(e.target.value as 'landlord' | 'tenant')}
                className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-sm font-semibold text-indigo-400 focus:outline-none focus:border-indigo-500 text-outfit"
              >
                <option value="landlord">Landlord (All Tabs)</option>
                <option value="tenant">Tenant (Restricted)</option>
              </select>
            </div>
          </div>

          <Suspense fallback={<div className="text-slate-400 text-sm">Loading...</div>}>
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'properties' && <Properties />}
            {activeTab === 'tenants' && <Tenants />}
            {activeTab === 'entities' && <Entities />}
            {activeTab === 'maintenance' && <Maintenance />}
            {activeTab === 'communications' && <Communications />}
            {activeTab === 'reports' && <Reports />}
            {activeTab === 'rent_collection' && (
              <InvoiceList
                invoices={displayedInvoices}
                onMarkAsPaid={markAsPaid}
                onUpdateInvoice={handleUpdateInvoice}
                onDelete={deleteInvoice}
              />
            )}
            {activeTab === 'transactions' && <Ledger />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Shell /> : <Login />;
}
