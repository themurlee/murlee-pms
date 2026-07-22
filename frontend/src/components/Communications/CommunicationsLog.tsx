import { useNotices, Notice } from '../../hooks/useNotices';

const TYPE_LABEL: Record<Notice['type'], string> = {
  rent_reminder: 'Rent Reminder',
  late_notice: 'Late Notice',
  maintenance_update: 'Maintenance Update',
  payment_confirmation: 'Payment Confirmation',
  adhoc: 'Message',
};

const TYPE_STYLE: Record<Notice['type'], string> = {
  rent_reminder: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  late_notice: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  maintenance_update: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  payment_confirmation: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  adhoc: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
};

const statusStyle = (s: Notice['status']) =>
  s === 'sent' ? 'text-emerald-400' : s === 'failed' ? 'text-rose-400' : 'text-slate-400';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const CommunicationsLog = () => {
  const { notices } = useNotices();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            Communications Log
          </h1>
          <p className="text-slate-400 text-sm mt-1">Every automated reminder and notice sent to tenants</p>
        </div>
      </div>

      {/* Table on wide screens, stacked cards on mobile */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto hidden sm:block">
          <table className="min-w-full divide-y divide-white/5 text-left">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Type</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Tenant</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Subject</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit text-right">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {notices.map(n => (
                <tr key={n.id} className="hover:bg-white/5 transition-all">
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${TYPE_STYLE[n.type]}`}>{TYPE_LABEL[n.type]}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-200 font-semibold">{n.tenant_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{n.subject}</td>
                  <td className={`px-6 py-4 text-xs font-bold uppercase ${statusStyle(n.status)}`}>{n.status}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 text-right whitespace-nowrap">{fmtDate(n.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked list */}
        <div className="sm:hidden divide-y divide-white/5">
          {notices.map(n => (
            <div key={n.id} className="p-4 flex flex-col gap-2">
              <div className="flex justify-between items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${TYPE_STYLE[n.type]}`}>{TYPE_LABEL[n.type]}</span>
                <span className={`text-[10px] font-bold uppercase ${statusStyle(n.status)}`}>{n.status}</span>
              </div>
              <div className="text-sm text-white font-semibold">{n.subject}</div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>{n.tenant_name}</span><span>{fmtDate(n.created_at)}</span>
              </div>
            </div>
          ))}
        </div>

        {notices.length === 0 && (
          <div className="p-10 text-center text-slate-500 text-sm">No communications yet. Reminders and notices appear here automatically.</div>
        )}
      </div>
    </div>
  );
};
