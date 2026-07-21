import { useEffect, useState } from 'react';
import { useBillingSettings, BillingSettings as Settings } from '../../hooks/useBillingSettings';

// Trigger button + modal for editing late-fee/reminder config and running the
// billing cycle on demand. Self-contained so InvoiceList only renders <BillingSettings/>.
export const BillingSettings = () => {
  const { settings, updateSettings, isSaving, runCycle, isRunning } = useBillingSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<Settings | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    await updateSettings(form);
    setIsOpen(false);
    showToast('Billing settings saved.');
  };

  const handleRun = async () => {
    const s = await runCycle();
    const parts = [`${s.generated} invoice(s) generated`, `${s.lateFees} late fee(s)`, `${s.reminders} reminder(s)`];
    showToast(s.note ? s.note : `Cycle complete: ${parts.join(', ')}.`);
  };

  return (
    <>
      <div className="flex gap-2">
        <button onClick={handleRun} disabled={isRunning}
          className="px-4 py-2 rounded-xl border border-emerald-500/25 text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 transition-all text-outfit disabled:opacity-50">
          {isRunning ? 'Running…' : 'Run Billing Cycle'}
        </button>
        <button onClick={() => setIsOpen(true)}
          className="px-4 py-2 rounded-xl border border-white/10 text-xs font-bold text-indigo-400 hover:bg-indigo-500/10 transition-all text-outfit">
          Billing Settings
        </button>
      </div>

      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 border-2 border-indigo-500 rounded-2xl shadow-2xl p-4 max-w-md backdrop-blur-xl text-xs text-slate-200 font-medium">
          {toast}
        </div>
      )}

      {isOpen && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white text-outfit">Billing Settings</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Late Fee ($)</label>
                  <input type="number" min={0} step="0.01" value={form.late_fee_amount}
                    onChange={e => setForm({ ...form, late_fee_amount: Number(e.target.value) })}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Grace (days)</label>
                  <input type="number" min={0} value={form.late_fee_grace_days}
                    onChange={e => setForm({ ...form, late_fee_grace_days: Number(e.target.value) })}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Rent Reminder (days before due)</label>
                <input type="number" min={0} value={form.reminder_days_before}
                  onChange={e => setForm({ ...form, reminder_days_before: Number(e.target.value) })}
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <label className="flex items-center gap-3 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={form.late_fee_enabled}
                  onChange={e => setForm({ ...form, late_fee_enabled: e.target.checked })} className="accent-indigo-500 w-4 h-4" />
                Auto-apply late fees after grace period
              </label>
              <label className="flex items-center gap-3 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={form.reminders_enabled}
                  onChange={e => setForm({ ...form, reminders_enabled: e.target.checked })} className="accent-indigo-500 w-4 h-4" />
                Send automated rent reminders
              </label>
              <div className="flex gap-3 justify-end mt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 text-outfit">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all text-outfit disabled:opacity-50">
                  {isSaving ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
