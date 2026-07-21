import { useUnits } from '../../hooks/useUnits';
import { downloadCsv } from '../../lib/csv';

interface RentRollProps {
  onBack?: () => void;
}

const fmtMoney = (n: number | null) => (n === null ? '—' : `$${n.toLocaleString()}`);
const fmtDate = (d: string | null) => d || '—';

export const RentRoll = ({ onBack }: RentRollProps) => {
  const { units, isLoading } = useUnits();

  const handleDownload = () => {
    downloadCsv(
      'rent-roll.csv',
      ['Property', 'Unit', 'Beds', 'Baths', 'Sq Ft', 'Current Tenant', 'Rent', 'Balance Due', 'Lease Start', 'Lease End'],
      units.map((u) => [
        u.property_name, u.unit_number, u.beds ?? '', u.baths ?? '', u.sq_ft ?? '',
        u.tenant_name || 'Vacant', u.rent ?? '', u.balance_due ?? '', u.lease_start || '', u.lease_end || '',
      ])
    );
  };

  return (
    <div className="glass-panel rounded-2xl flex flex-col gap-0">
      <div className="p-6 border-b border-white/5 flex justify-between items-start gap-4 flex-wrap">
        <div>
          {onBack && (
            <button onClick={onBack} className="text-indigo-400 hover:text-indigo-300 text-xs font-bold mb-2 block transition-all">
              &larr; Back to Rent Collection
            </button>
          )}
          <h2 className="text-2xl font-extrabold text-white text-outfit tracking-tight">Rent Roll</h2>
          <p className="text-slate-400 text-xs mt-0.5">Occupancy status, scheduled rents, and other leasing details by unit</p>
        </div>
        <button
          onClick={handleDownload}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/10 transition-all"
        >
          Download
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
          <thead className="bg-white/5">
            <tr>
              {['Property / Unit', 'Bed / Bath', 'Sq Ft', 'Current Tenant', 'Rent', 'Balance Due', 'Lease Start', 'Lease End'].map((h) => (
                <th key={h} className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {units.map((u) => (
              <tr key={u.id} className="hover:bg-white/5 transition-all align-top">
                <td className="px-5 py-4">
                  <div className="font-bold text-white text-sm">{u.property_name}</div>
                  <div className="text-xs text-slate-500">Unit {u.unit_number}</div>
                </td>
                <td className="px-5 py-4 text-sm text-slate-300">{u.beds ?? '—'} / {u.baths ?? '—'}</td>
                <td className="px-5 py-4 text-sm text-slate-300">{u.sq_ft ?? '—'}</td>
                {u.tenant_id ? (
                  <>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-200">{u.tenant_name}</td>
                    <td className="px-5 py-4 text-sm font-bold text-white">{fmtMoney(u.rent)}</td>
                    <td className={`px-5 py-4 text-sm font-bold ${(u.balance_due || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {fmtMoney(u.balance_due)}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(u.lease_start)}</td>
                    <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(u.lease_end)}</td>
                  </>
                ) : (
                  <td colSpan={5} className="px-5 py-4 text-sm text-slate-500 italic">Vacant — no active lease</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && units.length === 0 && (
          <div className="p-10 text-center text-slate-500 text-sm">No units yet.</div>
        )}
      </div>
    </div>
  );
};
