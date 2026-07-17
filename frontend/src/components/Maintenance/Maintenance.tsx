import { useState } from 'react';

interface MaintenanceTicket {
  id: string;
  tenant: string;
  issue: string;
  status: string;
  channel: string;
}

export const Maintenance = () => {
  const [maintenance, setMaintenance] = useState<MaintenanceTicket[]>([
    { id: '1', tenant: 'Jane Doe', issue: 'Leaky faucet in bathroom', status: 'open', channel: 'sms' },
    { id: '2', tenant: 'John Smith', issue: 'AC unit blowing warm air', status: 'in_progress', channel: 'email' },
  ]);

  const [isOpen, setIsOpen] = useState(false);
  const [tenant, setTenant] = useState('');
  const [issue, setIssue] = useState('');
  const [channel, setChannel] = useState('portal');
  const [status, setStatus] = useState('open');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant.trim() || !issue.trim()) return;

    const newTicket: MaintenanceTicket = {
      id: String(maintenance.length + 1),
      tenant,
      issue,
      status,
      channel,
    };

    setMaintenance([newTicket, ...maintenance]);
    // Reset Form
    setTenant('');
    setIssue('');
    setChannel('portal');
    setStatus('open');
    setIsOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            Maintenance Requests
          </h1>
          <p className="text-slate-400 text-sm mt-1">Inbound auto-created tickets via communication pipeline</p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] hover:shadow-indigo-500/35 transition-all duration-200 text-outfit"
        >
          + Create Request
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 gap-4">
        {maintenance.map(ticket => (
          <div key={ticket.id} className="glass-card p-6 rounded-2xl flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg text-white text-outfit">{ticket.issue}</h3>
              <p className="text-slate-400 text-sm mt-1">Tenant: {ticket.tenant}</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase bg-white/5 border border-white/5 text-slate-400 mt-3">
                Origin: {ticket.channel}
              </span>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
              ticket.status === 'open' 
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                : ticket.status === 'in_progress'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              {ticket.status.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-opacity">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 relative flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white text-outfit tracking-tight">Create Maintenance Request</h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white transition-colors font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Tenant Name</label>
                <input 
                  type="text" 
                  value={tenant}
                  onChange={e => setTenant(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Issue Description</label>
                <textarea 
                  value={issue}
                  onChange={e => setIssue(e.target.value)}
                  placeholder="Describe the maintenance request in detail..."
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors min-h-[100px] resize-y"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Origin Channel</label>
                  <select 
                    value={channel}
                    onChange={e => setChannel(e.target.value)}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="portal">Tenant Portal</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                    <option value="manual">Manual Entry</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Status</label>
                  <select 
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 transition-all text-outfit"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] hover:shadow-indigo-500/35 transition-all duration-200 text-outfit"
                >
                  Save Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
