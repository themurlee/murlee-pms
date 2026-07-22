import { useState } from 'react';
import { useTenants } from '../../hooks/useTenants';

interface NewMessageModalProps {
  onClose: () => void;
  onSend: (input: { tenant_id: string; subject: string; body: string }) => Promise<unknown>;
  isSending: boolean;
}

export const NewMessageModal = ({ onClose, onSend, isSending }: NewMessageModalProps) => {
  const { tenants, isLoading: tenantsLoading } = useTenants();
  const [tenantId, setTenantId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!tenantId) return setError('Pick a tenant.');
    if (!subject.trim()) return setError('Subject is required.');
    if (!body.trim()) return setError('Message can\'t be empty.');
    setError('');
    await onSend({ tenant_id: tenantId, subject: subject.trim(), body: body.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative backdrop-blur-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white font-bold text-lg"
        >
          ✕
        </button>
        <h3 className="text-xl font-bold text-white mb-4 text-outfit">New Message</h3>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">To</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={tenantsLoading}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">{tenantsLoading ? 'Loading tenants…' : 'Select a tenant'}</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a message…"
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 resize-none min-h-[120px]"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleSend}
            disabled={isSending}
            className="mt-1 px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all disabled:opacity-50 text-outfit"
          >
            {isSending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};
