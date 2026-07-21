import { useMemo, useState } from 'react';
import { useMaintenanceTickets } from '../../hooks/useMaintenanceTickets';
import { useUnits } from '../../hooks/useUnits';

const CATEGORIES = ['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'landscaping', 'general', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'emergency'];
const STATUSES = ['open', 'in_progress', 'resolved'];

const today = () => new Date().toISOString().split('T')[0];

const priorityStyle = (p: string) => ({
  emergency: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  high: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  medium: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  low: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
}[p] || 'bg-slate-500/15 text-slate-400 border-slate-500/30');

const statusStyle = (s: string) => ({
  open: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}[s] || 'bg-slate-500/10 text-slate-400 border-slate-500/20');

const fieldCls = 'bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors';
const labelCls = 'text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit';

export const Maintenance = () => {
  const { tickets, createTicket, inboundEmail, updateTicketStatus } = useMaintenanceTickets();
  const { units } = useUnits();

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isInboundOpen, setInboundOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 5000); };

  // ---- Create form state ----
  const [propertyId, setPropertyId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [issue, setIssue] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [reportedAt, setReportedAt] = useState(today());
  const [channel, setChannel] = useState('manual');
  const [status, setStatus] = useState('open');

  const properties = useMemo(() => {
    const seen = new Map<string, string>();
    units.forEach(u => seen.set(u.property_id, u.property_name));
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [units]);
  const unitsForProperty = useMemo(() => units.filter(u => u.property_id === propertyId), [units, propertyId]);
  const selectedUnit = units.find(u => u.id === unitId);

  const resetCreate = () => {
    setPropertyId(''); setUnitId(''); setIssue(''); setCategory('general');
    setPriority('medium'); setReportedAt(today()); setChannel('manual'); setStatus('open');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue.trim()) return;
    await createTicket({
      property_id: propertyId || undefined,
      unit_id: unitId || undefined,
      tenant_id: selectedUnit?.tenant_id || undefined,
      tenant: selectedUnit?.tenant_name || undefined,
      property_name: selectedUnit?.property_name ?? null,
      unit_number: selectedUnit?.unit_number ?? null,
      issue, channel, status, priority, category, reported_at: reportedAt,
    });
    resetCreate();
    setCreateOpen(false);
    showToast('Ticket created.');
  };

  // ---- Inbound simulator state ----
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [propHint, setPropHint] = useState('');
  const [inSubject, setInSubject] = useState('');
  const [inBody, setInBody] = useState('');

  const handleInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inSubject.trim() && !inBody.trim()) return;
    const res = await inboundEmail({
      from_email: fromEmail || undefined, from_name: fromName || undefined,
      property_hint: propHint || undefined, subject: inSubject, body: inBody,
    });
    setFromEmail(''); setFromName(''); setPropHint(''); setInSubject(''); setInBody('');
    setInboundOpen(false);
    showToast(`Inbound email converted to ticket — matched by ${res.matchedBy}.`);
  };

  return (
    <div className="flex flex-col gap-6">
      {toast && (
        <div className="fixed top-6 right-6 z-[60] bg-slate-900 border-2 border-indigo-500 rounded-2xl shadow-2xl p-4 max-w-md backdrop-blur-xl text-xs text-slate-200 font-medium">{toast}</div>
      )}

      <div className="flex justify-between items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">Maintenance Requests</h1>
          <p className="text-slate-400 text-sm mt-1">Track work orders by property, unit, priority &amp; category — inbound emails auto-convert to tickets</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={() => setInboundOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-white/10 text-indigo-400 font-bold text-sm hover:bg-indigo-500/10 transition-all text-outfit">
            Inbound Email
          </button>
          <button onClick={() => { resetCreate(); setCreateOpen(true); }}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all text-outfit">
            + Create Request
          </button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="glass-panel rounded-2xl overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5 text-left">
            <thead className="bg-white/5">
              <tr>
                {['Issue', 'Property / Unit', 'Tenant', 'Category', 'Priority', 'Reported', 'Status'].map(h => (
                  <th key={h} className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tickets.map(t => (
                <tr key={t.id} className="hover:bg-white/5 transition-all align-top">
                  <td className="px-5 py-4 text-sm text-white font-semibold max-w-xs">{t.issue}</td>
                  <td className="px-5 py-4 text-sm text-slate-300 whitespace-nowrap">
                    {t.property_name || '—'}{t.unit_number ? <span className="text-slate-500"> #{t.unit_number}</span> : ''}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300 whitespace-nowrap">{t.tenant}</td>
                  <td className="px-5 py-4 text-xs text-slate-400 capitalize">{t.category}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${priorityStyle(t.priority)}`}>{t.priority}</span>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">{t.reported_at}</td>
                  <td className="px-5 py-4">
                    <select value={t.status} onChange={e => updateTicketStatus({ id: t.id, status: e.target.value })}
                      className={`text-[11px] font-bold uppercase border rounded-lg px-2 py-1 bg-slate-950 focus:outline-none ${statusStyle(t.status)}`}>
                      {STATUSES.map(s => <option key={s} value={s} className="bg-slate-900 text-white">{s.replace('_', ' ')}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tickets.length === 0 && <div className="p-10 text-center text-slate-500 text-sm">No maintenance requests yet.</div>}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {tickets.map(t => (
          <div key={t.id} className="glass-card p-4 rounded-2xl flex flex-col gap-3">
            <div className="flex justify-between items-start gap-2">
              <h3 className="font-bold text-white text-sm">{t.issue}</h3>
              <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${priorityStyle(t.priority)}`}>{t.priority}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>{t.property_name || '—'}{t.unit_number ? ` #${t.unit_number}` : ''}</span>
              <span>{t.tenant}</span>
              <span className="capitalize">{t.category}</span>
              <span>{t.reported_at}</span>
            </div>
            <select value={t.status} onChange={e => updateTicketStatus({ id: t.id, status: e.target.value })}
              className={`text-[11px] font-bold uppercase border rounded-lg px-2 py-1.5 bg-slate-950 focus:outline-none w-fit ${statusStyle(t.status)}`}>
              {STATUSES.map(s => <option key={s} value={s} className="bg-slate-900 text-white">{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        ))}
        {tickets.length === 0 && <div className="glass-card p-10 rounded-2xl text-center text-slate-500 text-sm">No maintenance requests yet.</div>}
      </div>

      {/* Create modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 my-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white text-outfit">Create Maintenance Request</h2>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Property</label>
                  <select value={propertyId} onChange={e => { setPropertyId(e.target.value); setUnitId(''); }} className={fieldCls}>
                    <option value="">Select property…</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Unit</label>
                  <select value={unitId} onChange={e => setUnitId(e.target.value)} disabled={!propertyId} className={`${fieldCls} disabled:opacity-40`}>
                    <option value="">{propertyId ? 'Select unit…' : 'Pick a property first'}</option>
                    {unitsForProperty.map(u => <option key={u.id} value={u.id}>#{u.unit_number}{u.tenant_name ? ` — ${u.tenant_name}` : ''}</option>)}
                  </select>
                </div>
              </div>

              {selectedUnit && (
                <div className="text-xs bg-slate-950/50 border border-white/5 rounded-xl px-3 py-2 text-slate-400">
                  Tenant: <span className="text-slate-200 font-semibold">{selectedUnit.tenant_name || 'Vacant'}</span>
                  {selectedUnit.tenant_email && <span className="text-slate-500"> · {selectedUnit.tenant_email}</span>}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className={labelCls}>Issue Description</label>
                <textarea value={issue} onChange={e => setIssue(e.target.value)} required placeholder="Describe the maintenance request in detail…"
                  className={`${fieldCls} min-h-[90px] resize-y`} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className={`${fieldCls} capitalize`}>
                    {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className={`${fieldCls} capitalize`}>
                    {PRIORITIES.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Reported</label>
                  <input type="date" value={reportedAt} onChange={e => setReportedAt(e.target.value)} className={fieldCls} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Origin</label>
                  <select value={channel} onChange={e => setChannel(e.target.value)} className={fieldCls}>
                    <option value="manual">Manual</option>
                    <option value="portal">Portal</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} className={fieldCls}>
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 text-outfit">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all text-outfit">Save Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inbound email simulator */}
      {isInboundOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 my-8">
            <div>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white text-outfit">Inbound Email → Ticket</h2>
                <button onClick={() => setInboundOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Simulates an email hitting your maintenance inbox. It auto-matches to a tenant by email, then name, then property address.</p>
            </div>
            <form onSubmit={handleInbound} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>From Email</label>
                  <input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="tenant@example.com" className={fieldCls} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>From Name</label>
                  <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Jane Doe" className={fieldCls} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelCls}>Property Address Hint</label>
                <input value={propHint} onChange={e => setPropHint(e.target.value)} placeholder="Oakridge / 128 Oakridge Dr" className={fieldCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelCls}>Subject</label>
                <input value={inSubject} onChange={e => setInSubject(e.target.value)} placeholder="No hot water" className={fieldCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelCls}>Body</label>
                <textarea value={inBody} onChange={e => setInBody(e.target.value)} placeholder="The water heater stopped working this morning…" className={`${fieldCls} min-h-[90px] resize-y`} />
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <button type="button" onClick={() => setInboundOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 text-outfit">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all text-outfit">Convert to Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
