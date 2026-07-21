import { useState } from 'react';
import { useNotices, Notice } from '../../hooks/useNotices';
import { useTenants } from '../../hooks/useTenants';

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

export const Communications = () => {
  const { notices, sendNotice, isSending } = useNotices();
  const { tenants } = useTenants();

  const [isOpen, setIsOpen] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !subject.trim() || !body.trim()) return;
    setError(null);
    try {
      await sendNotice({ tenant_id: tenantId, subject, body });
      setTenantId(''); setSubject(''); setBody('');
      setIsOpen(false);
    } catch {
      setError('Failed to send. Try again.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            Communications
          </h1>
          <p className="text-slate-400 text-sm mt-1">Every reminder, notice, and message sent to tenants</p>
        </div>
        <button
          onClick={() => { setError(null); setIsOpen(true); }}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all duration-200 text-outfit"
        >
          + Send Email
        </button>
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
          <div className="p-10 text-center text-slate-500 text-sm">No communications yet. Reminders and notices appear here automatically; use “Send Email” for a one-off.</div>
        )}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white text-outfit">Send Email to Tenant</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
            </div>
            <form onSubmit={handleSend} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Tenant</label>
                <select value={tenantId} onChange={e => setTenantId(e.target.value)} required
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="">Select a tenant…</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name} — {t.email}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} required
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                  placeholder="e.g. Roof inspection Friday" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Message</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} required
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 min-h-[120px] resize-y"
                  placeholder="Write your message…" />
              </div>
              {error && <p className="text-rose-400 text-xs font-semibold">{error}</p>}
              <div className="flex gap-3 justify-end mt-2">
                <button type="button" onClick={() => setIsOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 text-outfit">Cancel</button>
                <button type="submit" disabled={isSending}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all text-outfit disabled:opacity-50">
                  {isSending ? 'Sending…' : 'Send Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
