import { Fragment, useMemo, useState, useEffect } from 'react';
import { Invoice } from '../../types/invoice';
import { TimelineView } from './TimelineView';
import { BillingSettings } from './BillingSettings';
import { RentRoll } from '../shared/RentRoll';
import { TenantLedger } from '../shared/TenantLedger';
import { useInvoiceActions } from '../../hooks/useInvoiceActions';

interface InvoiceListProps {
  invoices: Invoice[];
  onMarkAsPaid: (id: string) => void;
  onUpdateInvoice: (updated: Invoice) => void;
  onDelete: (id: string) => void;
}

type LeaseTab = 'active' | 'expired' | 'archived';
type View = 'ledger' | 'rent_roll' | 'tenant_ledger';

const isThisMonth = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
};

const LEASE_TAB_STATUS: Record<LeaseTab, string> = { active: 'active', expired: 'expired', archived: 'eviction' };

export const InvoiceList = ({ invoices, onMarkAsPaid, onUpdateInvoice, onDelete }: InvoiceListProps) => {
  const [view, setView] = useState<View>('ledger');
  const [leaseTab, setLeaseTab] = useState<LeaseTab>('active');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const { addInvoiceItem, deleteInvoiceItem, batchMarkAsPaid } = useInvoiceActions();
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [propertyInvoicesFor, setPropertyInvoicesFor] = useState<string | null>(null);

  // Dynamic Notes Log for Invoices
  const [invoiceNotes, setInvoiceNotes] = useState<Record<string, string[]>>({
    'INV-001': ['Tenant requested fee waiver due to bank transfer delay.', 'Landlord approved late fee waiver on July 3.'],
    'INV-002': ['Staged payment arrangement split agreement signed.']
  });
  const [newNote, setNewNote] = useState('');

  // Editing form states
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(0);
  const [editLateFee, setEditLateFee] = useState(0);
  const [editDueDate, setEditDueDate] = useState('');

  // Toast Notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync selected invoice if list state updates (e.g. status updates)
  useEffect(() => {
    if (selectedInvoice) {
      const match = invoices.find(i => i.id === selectedInvoice.id);
      if (match) setSelectedInvoice(match);
    }
  }, [invoices]);

  // Reset per-invoice UI state whenever a *different* invoice is selected —
  // otherwise editing/add-item state from a previously viewed invoice leaks
  // into the next one (e.g. "Add New Invoice Item" appearing stuck open, or
  // not appearing at all, depending on what was left open before).
  useEffect(() => {
    setIsEditing(false);
    setIsAddingItem(false);
    setNewItemDesc('');
    setNewItemAmount('');
    setPropertyInvoicesFor(null);
  }, [selectedInvoice?.id]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [leaseTab]);

  // Prune selectedIds whenever the invoices prop changes — a selected invoice
  // may have become 'paid' outside the batch flow (e.g. via the individual
  // per-row "Mark Paid" button while the row was still checked), and stale
  // ids left in selectedIds would inflate the floating bar's count/total and
  // get resubmitted in the next batchMarkAsPaid call.
  useEffect(() => {
    setSelectedIds((prev) => {
      const stillPaid = invoices.filter((i) => prev.has(i.id) && i.status === 'paid');
      if (stillPaid.length === 0) return prev;
      const next = new Set(prev);
      stillPaid.forEach((i) => next.delete(i.id));
      return next;
    });
  }, [invoices]);

  const handleMarkPaidWithNotification = (id: string) => {
    onMarkAsPaid(id);
    setToastMessage(`Payment registered successfully for ${id}. Tenant has been notified!`);

    // Automatically dismiss toast after 4s
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleAddItem = async (invoiceId: string) => {
    const amount = Number(newItemAmount);
    if (!newItemDesc.trim() || !newItemAmount || Number.isNaN(amount) || amount <= 0) return;
    await addInvoiceItem({ invoiceId, description: newItemDesc.trim(), amount });
    setNewItemDesc('');
    setNewItemAmount('');
    setIsAddingItem(false);
  };

  const handleDeleteItem = async (invoiceId: string, itemId: string) => {
    await deleteInvoiceItem({ invoiceId, itemId });
  };

  const handleStartEdit = (inv: Invoice) => {
    setEditAmount(inv.amount_due);
    setEditLateFee(inv.late_fee);
    setEditDueDate(inv.due_date);
    setIsEditing(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const updatedInvoice: Invoice = {
      ...selectedInvoice,
      amount_due: editAmount,
      late_fee: editLateFee,
      due_date: editDueDate,
      breakdown: {
        ...selectedInvoice.breakdown,
        base_rent: editAmount - editLateFee,
        late_fee: editLateFee,
        total_due: editAmount
      },
      timeline: [
        ...selectedInvoice.timeline,
        {
          timestamp: new Date().toISOString(),
          event: 'Invoice details updated',
          description: `Amount adjusted to $${editAmount} (Late fee: $${editLateFee}), due by ${editDueDate}.`
        }
      ]
    };

    onUpdateInvoice(updatedInvoice);
    setSelectedInvoice(updatedInvoice);
    setIsEditing(false);
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !selectedInvoice) return;

    const invId = selectedInvoice.id;
    setInvoiceNotes(prev => ({
      ...prev,
      [invId]: [...(prev[invId] || []), newNote.trim()]
    }));
    setNewNote('');
  };

  // KPI buckets: Upcoming/Completed scoped to this month by due_date; Processing/Overdue all-time.
  const kpis = useMemo(() => {
    const bucket = (pred: (i: Invoice) => boolean) =>
      invoices.filter(pred).reduce((acc, i) => ({ total: acc.total + i.breakdown.total_due, count: acc.count + 1 }), { total: 0, count: 0 });

    return {
      upcoming: bucket((i) => i.status === 'unpaid' && isThisMonth(i.due_date)),
      processing: bucket((i) => i.status === 'processing'),
      overdue: bucket((i) => i.status === 'overdue'),
      completed: bucket((i) => i.status === 'paid' && isThisMonth(i.due_date)),
    };
  }, [invoices]);

  const visibleInvoices = useMemo(
    () => invoices.filter((i) => (i.lease_status || 'active') === LEASE_TAB_STATUS[leaseTab]),
    [invoices, leaseTab]
  );

  const eligibleInvoices = useMemo(
    () => visibleInvoices.filter((i) => i.status !== 'paid'),
    [visibleInvoices]
  );

  const allEligibleSelected = eligibleInvoices.length > 0 && eligibleInvoices.every((i) => selectedIds.has(i.id));

  const toggleSelectAll = () => {
    if (allEligibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleInvoices.map((i) => i.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTotal = useMemo(
    () => invoices.filter((i) => selectedIds.has(i.id)).reduce((sum, i) => sum + i.breakdown.total_due, 0),
    [invoices, selectedIds]
  );

  const handleBatchMarkPaid = async () => {
    setIsBatchProcessing(true);
    try {
      const result = await batchMarkAsPaid(Array.from(selectedIds));
      setToastMessage(
        result.error_count > 0
          ? `${result.success_count} invoice${result.success_count === 1 ? '' : 's'} marked paid, ${result.error_count} failed.`
          : `${result.success_count} invoice${result.success_count === 1 ? '' : 's'} marked paid successfully.`
      );
    } finally {
      setIsBatchProcessing(false);
      setShowBatchConfirm(false);
      setSelectedIds(new Set());
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  if (view === 'rent_roll') return <RentRoll onBack={() => setView('ledger')} />;
  if (view === 'tenant_ledger') return <TenantLedger onBack={() => setView('ledger')} />;

  return (
    <div className="flex flex-col gap-6 relative">

      {/* Billing automation controls */}
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">Rent Collection</h1>
          <p className="text-slate-400 text-sm mt-1">Invoices auto-generate monthly; late fees apply after the grace period</p>
        </div>
        <BillingSettings />
      </div>

      {/* KPI cards + navigation to Rent Roll / Tenant Ledger */}
      <div className="flex flex-col gap-3">
        <div className="flex justify-end gap-5 text-xs font-bold">
          <button onClick={() => setView('rent_roll')} className="text-indigo-400 hover:text-indigo-300 transition-all">📋 View rent roll</button>
          <button onClick={() => setView('tenant_ledger')} className="text-indigo-400 hover:text-indigo-300 transition-all">📖 View tenant ledger</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            { label: 'Upcoming', scope: 'This month', data: kpis.upcoming, color: 'text-slate-200', dot: 'bg-indigo-400' },
            { label: 'Processing', scope: 'All time', data: kpis.processing, color: 'text-slate-200', dot: 'bg-blue-400' },
            { label: 'Overdue', scope: 'All time', data: kpis.overdue, color: 'text-rose-400', dot: 'bg-rose-400' },
            { label: 'Completed', scope: 'This month', data: kpis.completed, color: 'text-emerald-400', dot: 'bg-emerald-400' },
          ] as const).map((k) => (
            <div key={k.label} className="glass-card p-5 rounded-2xl flex flex-col gap-2">
              <span className="inline-flex items-center gap-1.5 self-start text-[11px] font-bold text-slate-300 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                <span className={`w-1.5 h-1.5 rounded-full ${k.dot}`} />{k.label}
              </span>
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">{k.scope}</span>
              <div className="flex items-end justify-between">
                <span className={`text-2xl font-extrabold text-outfit ${k.color}`}>${k.data.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span className="text-xs text-slate-500">{k.data.count} invoice{k.data.count === 1 ? '' : 's'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Premium Toast Notification Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 animate-slideIn bg-slate-900 border-2 border-emerald-500 rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-4 max-w-md backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔔</span>
            <div>
              <div className="font-bold text-white text-xs uppercase tracking-wider text-outfit">System Notification</div>
              <p className="text-slate-300 text-xs mt-0.5 font-medium">{toastMessage}</p>
            </div>
          </div>
          <button 
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white font-bold text-lg"
          >
            &times;
          </button>
        </div>
      )}

      {selectedIds.size > 0 && !showBatchConfirm && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 backdrop-blur-xl">
          <span className="text-sm font-semibold text-white">{selectedIds.size} selected</span>
          <button
            onClick={() => setShowBatchConfirm(true)}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-lg text-white font-semibold shadow-md shadow-emerald-600/20 transition-all"
          >
            Mark Paid
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-slate-400 hover:text-white font-semibold"
          >
            Cancel
          </button>
        </div>
      )}

      {showBatchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <h3 className="text-lg font-bold text-white text-outfit">Mark {selectedIds.size} invoice{selectedIds.size === 1 ? '' : 's'} as paid?</h3>
            <p className="text-sm text-slate-400">
              Total: <strong className="text-white">${selectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>.
              Each affected tenant will receive a payment confirmation email.
            </p>
            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={() => setShowBatchConfirm(false)}
                disabled={isBatchProcessing}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchMarkPaid}
                disabled={isBatchProcessing}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white disabled:opacity-50"
              >
                {isBatchProcessing ? 'Marking paid…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container Layout */}
      <div className="flex gap-6 items-start flex-col w-full">

        {/* Invoice Grid Table */}
        <div className="overflow-hidden glass-panel rounded-2xl w-full transition-all duration-300">
          <div className="p-6 border-b border-white/5">
            <h2 className="text-2xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
              Rent Collection Ledger
            </h2>
            <p className="text-slate-400 text-xs mt-0.5">Collect rental payments, Waive fees, and review tenant invoices</p>
          </div>

          {/* Lease status tabs */}
          <div className="flex gap-6 px-6 pt-4 border-b border-white/5 text-sm font-semibold">
            {(['active', 'expired', 'archived'] as LeaseTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setLeaseTab(t)}
                className={`pb-3 capitalize transition-colors ${leaseTab === t ? 'border-b-2 border-indigo-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={allEligibleSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-white/20 bg-slate-950"
                  />
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Property Nickname</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Tenant</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Lease Duration</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Amount Details</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Arrangements</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent">
              {visibleInvoices.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-500 text-sm">No {leaseTab} leases to show.</td></tr>
              )}
              {visibleInvoices.map(inv => {
                const hasPaymentPlan = inv.id === 'INV-002';
                const lateFeeWaived = inv.id === 'INV-001';
                const isExpanded = selectedInvoice?.id === inv.id;

                return (
                  <Fragment key={inv.id}>
                  <tr
                    onClick={() => setSelectedInvoice(isExpanded ? null : inv)}
                    className={`hover:bg-white/5 transition-all duration-150 align-middle cursor-pointer ${
                      isExpanded ? 'bg-indigo-500/5 border-l-2 border-indigo-500' : ''
                    }`}
                  >
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      {inv.status !== 'paid' && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggleSelectOne(inv.id)}
                          className="w-4 h-4 rounded border-white/20 bg-slate-950"
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-outfit text-white text-sm">
                      {inv.property_nickname || '—'}{inv.unit_number ? <span className="text-slate-500 font-normal"> · Unit {inv.unit_number}</span> : ''}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300 font-semibold">{inv.tenant_name || '—'}</td>
                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                      {inv.lease_start && inv.lease_end ? `${inv.lease_start} – ${inv.lease_end}` : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="font-extrabold text-white text-outfit">${inv.breakdown.total_due.toLocaleString()}</div>
                      {inv.late_fee > 0 && !lateFeeWaived && (
                        <div className="text-xs text-rose-400 font-semibold mt-0.5">Late Fee: +${inv.late_fee}</div>
                      )}
                      {inv.items.length > 0 && (
                        <div className="text-xs text-indigo-400 font-semibold mt-0.5">+{inv.items.length} item{inv.items.length === 1 ? '' : 's'}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {hasPaymentPlan && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          Payment Plan Active
                        </span>
                      )}
                      {lateFeeWaived && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Late Fee Waived
                        </span>
                      )}
                      {!hasPaymentPlan && !lateFeeWaived && (
                        <span className="text-slate-500 text-xs italic">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase border ${
                        inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        inv.status === 'overdue' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                        {inv.status !== 'paid' && (
                          <button 
                            onClick={() => handleMarkPaidWithNotification(inv.id)} 
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-white font-semibold shadow-md shadow-emerald-600/20 transition-all duration-150"
                          >
                            Mark Paid
                          </button>
                        )}
                        <button 
                          onClick={() => onDelete(inv.id)} 
                          className="text-xs bg-rose-600/10 hover:bg-rose-600/20 px-3 py-1.5 rounded-lg text-rose-400 font-semibold border border-rose-500/20 transition-all duration-150"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="p-0 bg-slate-950/20">
                        <div className="p-6 flex flex-col gap-6 border-t border-white/5 animate-fadeIn">

                          {/* Expanded Header */}
                          <div className="flex justify-between items-start border-b border-white/5 pb-4">
                            <div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-bold text-white text-outfit">
                                  {selectedInvoice!.property_nickname || '—'}{selectedInvoice!.unit_number ? ` · Unit ${selectedInvoice!.unit_number}` : ''}
                                </h2>
                                <button
                                  onClick={() => setPropertyInvoicesFor(selectedInvoice!.property_nickname || null)}
                                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all"
                                >
                                  All invoices →
                                </button>
                              </div>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border mt-1.5 ${
                                selectedInvoice!.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                selectedInvoice!.status === 'overdue' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}>
                                {selectedInvoice!.status}
                              </span>
                            </div>
                            <button
                              onClick={() => setSelectedInvoice(null)}
                              className="text-slate-400 hover:text-white transition-colors font-bold text-lg"
                            >
                              &times;
                            </button>
                          </div>

                          {propertyInvoicesFor ? (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">All Invoices · {propertyInvoicesFor}</h4>
                                <button onClick={() => setPropertyInvoicesFor(null)} className="text-xs text-indigo-400 hover:text-indigo-300 font-bold">← Back to invoice</button>
                              </div>
                              <div className="overflow-hidden rounded-xl border border-white/5">
                                <table className="min-w-full divide-y divide-white/5 text-left text-sm">
                                  <thead className="bg-white/5">
                                    <tr>
                                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tenant / Unit</th>
                                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Due Date</th>
                                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Amount</th>
                                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5">
                                    {invoices.filter((i) => i.property_nickname === propertyInvoicesFor).map((i) => (
                                      <tr
                                        key={i.id}
                                        onClick={() => { setSelectedInvoice(i); setPropertyInvoicesFor(null); }}
                                        className="hover:bg-white/5 cursor-pointer transition-all"
                                      >
                                        <td className="px-4 py-3">
                                          <div className="font-semibold text-white">{i.tenant_name || '—'}</div>
                                          <div className="text-xs text-slate-500">Unit {i.unit_number || '—'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-400">{i.due_date}</td>
                                        <td className="px-4 py-3 text-right font-bold text-white">${i.breakdown.total_due.toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                            i.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            i.status === 'overdue' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                            'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                          }`}>{i.status}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Left column: edit / breakdown / items / mark-paid */}
                              <div className="flex flex-col gap-4">
                                {isEditing ? (
                                  <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
                                    <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Edit Invoice details</h4>
                                    <div className="flex flex-col gap-2">
                                      <label className="text-[10px] text-slate-500 font-bold uppercase">Total Amount Due ($)</label>
                                      <input
                                        type="number"
                                        value={editAmount}
                                        onChange={e => setEditAmount(Number(e.target.value))}
                                        className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                                        required
                                      />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <label className="text-[10px] text-slate-500 font-bold uppercase">Late Penalty Fee ($)</label>
                                      <input
                                        type="number"
                                        value={editLateFee}
                                        onChange={e => setEditLateFee(Number(e.target.value))}
                                        className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                                        required
                                      />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <label className="text-[10px] text-slate-500 font-bold uppercase">Due Date</label>
                                      <input
                                        type="date"
                                        value={editDueDate}
                                        onChange={e => setEditDueDate(e.target.value)}
                                        className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                                        required
                                      />
                                    </div>
                                    <div className="flex gap-2 justify-end mt-2">
                                      <button
                                        type="button"
                                        onClick={() => setIsEditing(false)}
                                        className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/5"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="submit"
                                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white"
                                      >
                                        Save (Silent)
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <>
                                    <div className="flex justify-between items-center">
                                      <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">{selectedInvoice!.id} Breakdown</h4>
                                      {selectedInvoice!.status !== 'paid' && selectedInvoice!.actions.can_edit && (
                                        <button
                                          onClick={() => handleStartEdit(selectedInvoice!)}
                                          className="text-xs text-indigo-400 hover:text-indigo-300 font-bold"
                                        >
                                          Edit Invoice
                                        </button>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/40 p-3 rounded-xl border border-white/5">
                                      <div>
                                        <span className="text-slate-500 block">Amount Due</span>
                                        <strong className="text-white text-sm text-outfit">${selectedInvoice!.breakdown.total_due.toLocaleString()}</strong>
                                      </div>
                                      <div>
                                        <span className="text-slate-500 block">Due Date</span>
                                        <strong className="text-white text-sm text-outfit">{selectedInvoice!.due_date}</strong>
                                      </div>
                                      <div>
                                        <span className="text-slate-500 block">Late Fee</span>
                                        <strong className="text-rose-400 font-bold">${selectedInvoice!.late_fee}</strong>
                                      </div>
                                      <div>
                                        <span className="text-slate-500 block">Payment Method</span>
                                        <strong className="text-slate-300">{selectedInvoice!.breakdown.payment_method}</strong>
                                      </div>
                                    </div>

                                    {/* Custom invoice items */}
                                    <div className="flex flex-col gap-2">
                                      {selectedInvoice!.items.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between gap-2 text-xs bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                                          <span className="text-slate-300 truncate">{item.description}</span>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-white font-semibold">${item.amount.toLocaleString()}</span>
                                            {selectedInvoice!.status !== 'paid' && (
                                              <button
                                                onClick={() => handleDeleteItem(selectedInvoice!.id, item.id)}
                                                className="text-slate-500 hover:text-rose-400 transition-colors"
                                                title="Remove item"
                                              >
                                                🗑
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}

                                      {selectedInvoice!.status !== 'paid' && (
                                        isAddingItem ? (
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              value={newItemDesc}
                                              onChange={(e) => setNewItemDesc(e.target.value)}
                                              placeholder="Enter fee name"
                                              className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                                            />
                                            <input
                                              type="number"
                                              min={0}
                                              step="0.01"
                                              value={newItemAmount}
                                              onChange={(e) => setNewItemAmount(e.target.value)}
                                              placeholder="$0.00"
                                              className="w-24 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                                            />
                                            <button onClick={() => setIsAddingItem(false)} className="text-slate-500 hover:text-rose-400 transition-colors" title="Cancel">🗑</button>
                                            <button onClick={() => handleAddItem(selectedInvoice!.id)} className="text-emerald-400 hover:text-emerald-300 transition-colors font-bold" title="Confirm">✓</button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => setIsAddingItem(true)}
                                            className="self-start text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all"
                                          >
                                            + Add New Invoice Item
                                          </button>
                                        )
                                      )}

                                      <div className="flex justify-between items-center border-t border-white/5 pt-2 mt-1">
                                        <span className="text-xs font-bold text-slate-300">Invoice total</span>
                                        <span className="text-sm font-extrabold text-white text-outfit">${selectedInvoice!.breakdown.total_due.toLocaleString()}</span>
                                      </div>
                                    </div>

                                    {selectedInvoice!.status !== 'paid' && selectedInvoice!.actions.can_mark_as_paid && (
                                      <button
                                        onClick={() => handleMarkPaidWithNotification(selectedInvoice!.id)}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 py-2.5 rounded-xl font-bold text-white text-xs shadow-md shadow-emerald-600/10 transition-all text-outfit mt-2"
                                      >
                                        Mark Invoice as Paid (Notify Tenant)
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>

                              {/* Right column: tenant/lease file, timeline, notes */}
                              <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-3">
                                  <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Tenant & Lease File</h4>
                                  <div className="flex flex-col gap-2 text-xs bg-slate-950/40 p-3 rounded-xl border border-white/5">
                                    <div>
                                      <span className="text-slate-500 block">Tenant Name</span>
                                      <strong className="text-white text-sm">{selectedInvoice!.tenant_name || '—'}</strong>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-2 mt-1">
                                      <div>
                                        <span className="text-slate-500 block">Property / Unit</span>
                                        <strong className="text-slate-300">
                                          {selectedInvoice!.property_nickname || '—'}{selectedInvoice!.unit_number ? ` #${selectedInvoice!.unit_number}` : ''}
                                        </strong>
                                      </div>
                                      <div>
                                        <span className="text-slate-500 block">Lease Term</span>
                                        <strong className="text-slate-300">
                                          {selectedInvoice!.lease_start && selectedInvoice!.lease_end
                                            ? `${selectedInvoice!.lease_start} – ${selectedInvoice!.lease_end}`
                                            : '—'}
                                        </strong>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-3">
                                  <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Invoice Event Log</h4>
                                  <div className="max-h-[140px] overflow-y-auto pr-1">
                                    <TimelineView data={selectedInvoice!.timeline} />
                                  </div>
                                </div>

                                <div className="flex flex-col gap-3">
                                  <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Bookkeeping Notes</h4>
                                  <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1">
                                    {(invoiceNotes[selectedInvoice!.id] || []).map((note, idx) => (
                                      <div key={idx} className="text-xs bg-white/5 border border-white/5 rounded-xl p-3 text-slate-300">
                                        {note}
                                      </div>
                                    ))}
                                    {(invoiceNotes[selectedInvoice!.id] || []).length === 0 && (
                                      <span className="text-slate-500 text-xs italic p-1">No notes recorded for this invoice yet.</span>
                                    )}
                                  </div>
                                  <form onSubmit={handleAddNote} className="flex gap-2 items-end mt-2">
                                    <textarea
                                      value={newNote}
                                      onChange={e => setNewNote(e.target.value)}
                                      placeholder="Add custom invoice notes..."
                                      className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 flex-1 resize-none h-[40px]"
                                      required
                                    />
                                    <button
                                      type="submit"
                                      className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-xl font-bold text-white text-xs shadow-md shadow-indigo-600/10 transition-all text-outfit h-[40px]"
                                    >
                                      Save Note
                                    </button>
                                  </form>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};
