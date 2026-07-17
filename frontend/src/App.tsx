import { useState } from 'react';
import { Bookkeeping } from './components/Bookkeeping/Bookkeeping';
import { Dashboard } from './components/Dashboard/Dashboard';
import { InvoiceList } from './components/Invoices/InvoiceList';
import { Maintenance } from './components/Maintenance/Maintenance';
import { Properties } from './components/Properties/Properties';
import { Reports } from './components/Reports/Reports';
import { Tenants } from './components/Tenants/Tenants';
import { Ledger } from './components/Transactions/Ledger';
import { Invoice } from './types/invoice';

type TabType = 'dashboard' | 'properties' | 'tenants' | 'bookkeeping' | 'maintenance' | 'reports' | 'rent_collection' | 'transactions';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [userRole, setUserRole] = useState<'landlord' | 'tenant'>('landlord');

  const initialInvoices: Invoice[] = [
    {
      id: 'INV-001',
      lease_id: 'L-101',
      due_date: '2026-07-01',
      amount_due: 1400.00,
      late_fee: 0.00,
      status: 'unpaid',
      transfer_id: 'tx_123',
      created_at: '2026-06-25T08:00:00Z',
      actions: { can_mark_as_paid: true, can_edit: true, can_delete: true },
      active_view: 'payment_timeline',
      timeline: [
        { timestamp: '2026-06-25T08:00:00Z', event: 'Invoice created', description: 'Scheduled monthly rent invoice generated.' }
      ],
      breakdown: { base_rent: 1400, late_fee: 0, total_due: 1400, payment_method: 'ACH - Plaid' }
    },
    {
      id: 'INV-002',
      lease_id: 'L-102',
      due_date: '2026-06-01',
      amount_due: 1350.00,
      late_fee: 50.00,
      status: 'overdue',
      transfer_id: 'tx_456',
      created_at: '2026-05-25T08:00:00Z',
      actions: { can_mark_as_paid: true, can_edit: true, can_delete: true },
      active_view: 'payment_timeline',
      timeline: [
        { timestamp: '2026-05-25T08:00:00Z', event: 'Invoice created', description: 'Scheduled monthly rent invoice generated.' },
        { timestamp: '2026-06-02T00:00:00Z', event: 'Late fee applied', description: '$50 late penalty assessed.' }
      ],
      breakdown: { base_rent: 1350, late_fee: 50, total_due: 1400, payment_method: 'ACH - Plaid' }
    }
  ];

  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);

  const handleMarkAsPaid = (id: string) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id === id) {
        return {
          ...inv,
          status: 'paid',
          actions: { can_mark_as_paid: false, can_edit: false, can_delete: false },
          timeline: [
            ...inv.timeline,
            { timestamp: new Date().toISOString(), event: 'Payment completed', description: 'Marked as paid manually by landlord.' }
          ]
        };
      }
      return inv;
    }));
  };

  const handleUpdateInvoice = (updated: Invoice) => {
    setInvoices(prev => prev.map(inv => inv.id === updated.id ? updated : inv));
  };

  const handleDeleteInvoice = (id: string) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  };

  // Adjust active tab if switching role to Tenant on restricted tabs
  const handleRoleChange = (role: 'landlord' | 'tenant') => {
    setUserRole(role);
    if (role === 'tenant' && ['bookkeeping', 'reports', 'transactions'].includes(activeTab)) {
      setActiveTab('dashboard');
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-950/20 text-slate-100 font-sans backdrop-blur-3xl">
      {/* Sidebar Navigation */}
      <aside className="w-68 bg-slate-900/30 backdrop-blur-2xl border-r border-white/5 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30 text-outfit">M</div>
          <span className="text-xl font-bold tracking-tight text-white text-outfit bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Murlee PMS</span>
        </div>
        
        <nav className="flex flex-col gap-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`text-left px-4 py-3 rounded-xl capitalize font-semibold transition-all duration-200 text-outfit ${
              activeTab === 'dashboard' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            Dashboard
          </button>
          
          <button
            onClick={() => setActiveTab('properties')}
            className={`text-left px-4 py-3 rounded-xl capitalize font-semibold transition-all duration-200 text-outfit ${
              activeTab === 'properties' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            Properties
          </button>

          <button
            onClick={() => setActiveTab('tenants')}
            className={`text-left px-4 py-3 rounded-xl capitalize font-semibold transition-all duration-200 text-outfit ${
              activeTab === 'tenants' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            Tenants
          </button>

          {/* Bookkeeping Tab (Landlord Only) */}
          {userRole === 'landlord' && (
            <button
              onClick={() => setActiveTab('bookkeeping')}
              className={`text-left px-4 py-3 rounded-xl capitalize font-semibold transition-all duration-200 text-outfit ${
                activeTab === 'bookkeeping' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              Bookkeeping
            </button>
          )}

          <button
            onClick={() => setActiveTab('maintenance')}
            className={`text-left px-4 py-3 rounded-xl capitalize font-semibold transition-all duration-200 text-outfit ${
              activeTab === 'maintenance' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            Maintenance
          </button>

          {/* Reports Tab (Landlord Only) */}
          {userRole === 'landlord' && (
            <button
              onClick={() => setActiveTab('reports')}
              className={`text-left px-4 py-3 rounded-xl capitalize font-semibold transition-all duration-200 text-outfit ${
                activeTab === 'reports' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              Reports
            </button>
          )}

          <button
            onClick={() => setActiveTab('rent_collection')}
            className={`text-left px-4 py-3 rounded-xl capitalize font-semibold transition-all duration-200 text-outfit ${
              activeTab === 'rent_collection' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            Rent Collection
          </button>

          {/* Transactions Tab (Landlord Only) */}
          {userRole === 'landlord' && (
            <button
              onClick={() => setActiveTab('transactions')}
              className={`text-left px-4 py-3 rounded-xl capitalize font-semibold transition-all duration-200 text-outfit ${
                activeTab === 'transactions' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              Transactions
            </button>
          )}
        </nav>
      </aside>

      {/* Main Panel Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
          {/* Header with Role Selector */}
          <div className="flex justify-between items-center pb-4 border-b border-white/5">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest text-outfit">Active Node: Sandbox Session</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Access Role:</span>
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

          <div>
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'properties' && <Properties />}
            {activeTab === 'tenants' && <Tenants />}
            {activeTab === 'bookkeeping' && <Bookkeeping />}
            {activeTab === 'maintenance' && <Maintenance />}
            {activeTab === 'reports' && <Reports />}
             {activeTab === 'rent_collection' && (
              <InvoiceList 
                invoices={invoices} 
                onMarkAsPaid={handleMarkAsPaid} 
                onUpdateInvoice={handleUpdateInvoice}
                onDelete={handleDeleteInvoice} 
              />
            )}
            {activeTab === 'transactions' && <Ledger />}
          </div>
        </div>
      </main>
    </div>
  );
}
