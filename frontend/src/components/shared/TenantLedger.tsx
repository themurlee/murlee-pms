import { useMemo, useState } from 'react';
import { useInvoices } from '../../hooks/useInvoices';
import { downloadCsv } from '../../lib/csv';

interface TenantLedgerProps {
  onBack?: () => void;
}

const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface LeaseOption {
  lease_id: string;
  tenant_name: string;
  unit_number: string;
  lease_start: string;
  lease_end: string;
}

export const TenantLedger = ({ onBack }: TenantLedgerProps) => {
  const { data: invoices = [] } = useInvoices();
  const [propertyFilter, setPropertyFilter] = useState('');
  const [leaseId, setLeaseId] = useState('');

  const properties = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.property_nickname).filter(Boolean))) as string[],
    [invoices]
  );

  const leaseOptions = useMemo(() => {
    const byLease = new Map<string, LeaseOption>();
    invoices
      .filter((i) => !propertyFilter || i.property_nickname === propertyFilter)
      .forEach((i) => {
        if (!i.lease_id || byLease.has(i.lease_id)) return;
        byLease.set(i.lease_id, {
          lease_id: i.lease_id,
          tenant_name: i.tenant_name || 'Tenant',
          unit_number: i.unit_number || '',
          lease_start: i.lease_start || '',
          lease_end: i.lease_end || '',
        });
      });
    return Array.from(byLease.values());
  }, [invoices, propertyFilter]);

  const selectedLease = leaseOptions.find((l) => l.lease_id === leaseId);

  const rows = useMemo(
    () =>
      invoices
        .filter((i) => i.lease_id === leaseId)
        .slice()
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [invoices, leaseId]
  );

  const handleDownload = () => {
    if (!selectedLease) return;
    downloadCsv(
      `tenant-ledger-${selectedLease.tenant_name.replace(/\s+/g, '-').toLowerCase()}.csv`,
      ['Charge / Payment Description', 'Date Due', 'Date Paid', 'Date Deposited (est)', 'Amount Due', 'Amount Paid'],
      rows.map((inv) => {
        const total = inv.amount_due + inv.late_fee;
        const paidDate = inv.paid_at ? inv.paid_at.split('T')[0] : '';
        return ['Rent & Fees', inv.due_date, paidDate, paidDate, total.toFixed(2), inv.status === 'paid' ? total.toFixed(2) : ''];
      })
    );
  };

  const fieldCls = 'bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500';

  return (
    <div className="glass-panel rounded-2xl flex flex-col gap-0">
      <div className="p-6 border-b border-white/5 flex flex-col gap-4">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            {onBack && (
              <button onClick={onBack} className="text-indigo-400 hover:text-indigo-300 text-xs font-bold mb-2 block transition-all">
                &larr; Back to Rent Collection
              </button>
            )}
            <h2 className="text-2xl font-extrabold text-white text-outfit tracking-tight">Tenant Ledger</h2>
            <p className="text-slate-400 text-xs mt-0.5">Charges, payments, and running balance for a specific tenant</p>
          </div>
          <button
            onClick={handleDownload}
            disabled={!selectedLease}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/10 transition-all disabled:opacity-40"
          >
            Download
          </button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <select
            value={propertyFilter}
            onChange={(e) => { setPropertyFilter(e.target.value); setLeaseId(''); }}
            className={fieldCls}
          >
            <option value="">All properties</option>
            {properties.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={leaseId} onChange={(e) => setLeaseId(e.target.value)} className={fieldCls}>
            <option value="">Select tenant…</option>
            {leaseOptions.map((l) => (
              <option key={l.lease_id} value={l.lease_id}>
                {l.tenant_name} · Unit {l.unit_number} · {l.lease_start} – {l.lease_end}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedLease ? (
        <div className="p-10 text-center text-slate-500 text-sm">Select a property and tenant to view their ledger.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
            <thead className="bg-white/5">
              <tr>
                {['Charge / Payment Description', 'Date Due', 'Date Paid', 'Date Deposited (est)', 'Amount Due', 'Amount Paid'].map((h, i) => (
                  <th key={h} className={`px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit whitespace-nowrap ${i >= 4 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((inv) => {
                const total = inv.amount_due + inv.late_fee;
                const paidDate = inv.paid_at ? inv.paid_at.split('T')[0] : '—';
                return (
                  <tr key={inv.id} className="hover:bg-white/5 transition-all">
                    <td className="px-5 py-4 text-sm font-semibold text-white">Rent & Fees</td>
                    <td className="px-5 py-4 text-sm text-slate-300">{inv.due_date}</td>
                    <td className="px-5 py-4 text-sm text-slate-300">{paidDate}</td>
                    <td className="px-5 py-4 text-sm text-slate-300">{paidDate}</td>
                    <td className="px-5 py-4 text-sm text-right font-bold text-white">{fmtMoney(total)}</td>
                    <td className="px-5 py-4 text-sm text-right font-bold text-emerald-400">{inv.status === 'paid' ? fmtMoney(total) : '—'}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500 text-sm">No invoices for this tenant yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
