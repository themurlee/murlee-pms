import { useState, useEffect } from 'react';
import { Invoice } from '../../types/invoice';
import { TimelineView } from './TimelineView';

interface InvoiceListProps {
  invoices: Invoice[];
  onMarkAsPaid: (id: string) => void;
  onUpdateInvoice: (updated: Invoice) => void;
  onDelete: (id: string) => void;
}

export const InvoiceList = ({ invoices, onMarkAsPaid, onUpdateInvoice, onDelete }: InvoiceListProps) => {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

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

  const handleMarkPaidWithNotification = (id: string) => {
    onMarkAsPaid(id);
    setToastMessage(`Payment registered successfully for ${id}. Tenant has been notified!`);
    
    // Automatically dismiss toast after 4s
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
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

  // Mock Tenant & Lease Detail lookup based on lease_id
  const getMockTenantDetails = (leaseId: string) => {
    if (leaseId === 'LEASE-101') {
      return {
        tenantName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '555-0199',
        property: 'Oakridge Manor #101',
        term: '1 Year Lease (Active)',
        signedDate: 'Jan 1, 2026'
      };
    }
    return {
      tenantName: 'John Smith',
      email: 'john@example.com',
      phone: '555-0144',
      property: 'Pacific Breeze #4',
      term: '2 Year Lease (Active)',
      signedDate: 'Feb 15, 2025'
    };
  };

  return (
    <div className="flex flex-col gap-6 relative">
      
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

      {/* Main Container Layout */}
      <div className="flex gap-6 items-start flex-col lg:flex-row w-full">
        
        {/* Invoice Grid Table */}
        <div className={`overflow-hidden glass-panel rounded-2xl w-full transition-all duration-300 ${selectedInvoice ? 'lg:w-[65%]' : 'w-full'}`}>
          <div className="p-6 border-b border-white/5">
            <h2 className="text-2xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
              Rent Collection Ledger
            </h2>
            <p className="text-slate-400 text-xs mt-0.5">Collect rental payments, Waive fees, and review tenant invoices</p>
          </div>
          
          <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Invoice ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Due Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Amount Details</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Arrangements</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent">
              {invoices.map(inv => {
                const hasPaymentPlan = inv.id === 'INV-002';
                const lateFeeWaived = inv.id === 'INV-001';

                return (
                  <tr 
                    key={inv.id} 
                    onClick={() => { setSelectedInvoice(inv); setIsEditing(false); }}
                    className={`hover:bg-white/5 transition-all duration-150 align-middle cursor-pointer ${
                      selectedInvoice?.id === inv.id ? 'bg-indigo-500/5 border-l-2 border-indigo-500' : ''
                    }`}
                  >
                    <td className="px-6 py-4 font-bold text-outfit text-indigo-400">
                      {inv.id}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{inv.due_date}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="font-extrabold text-white text-outfit">${inv.amount_due}</div>
                      {inv.late_fee > 0 && !lateFeeWaived && (
                        <div className="text-xs text-rose-400 font-semibold mt-0.5">Late Fee: +${inv.late_fee}</div>
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
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Invoice Detail History Sidebar Drawer */}
        {selectedInvoice && (
          <div className="glass-panel w-full lg:w-[35%] rounded-2xl p-6 flex flex-col gap-6 relative animate-fadeIn">
            
            {/* Drawer Header */}
            <div className="flex justify-between items-start border-b border-white/5 pb-4">
              <div>
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">Billing Invoice File</span>
                <h2 className="text-xl font-bold text-white text-outfit">{selectedInvoice.id}</h2>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border mt-1.5 ${
                  selectedInvoice.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  selectedInvoice.status === 'overdue' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                  'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {selectedInvoice.status}
                </span>
              </div>
              <button 
                onClick={() => setSelectedInvoice(null)}
                className="text-slate-400 hover:text-white transition-colors font-bold text-lg"
              >
                &times;
              </button>
            </div>

            {/* Edit Invoice Section or Summary */}
            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="flex flex-col gap-4 border-b border-white/5 pb-4">
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
              <div className="flex flex-col gap-4 border-b border-white/5 pb-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Statement Breakdown</h4>
                  {selectedInvoice.status !== 'paid' && selectedInvoice.actions.can_edit && (
                    <button 
                      onClick={() => handleStartEdit(selectedInvoice)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-bold"
                    >
                      Edit Invoice
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/40 p-3 rounded-xl border border-white/5">
                  <div>
                    <span className="text-slate-500 block">Amount Due</span>
                    <strong className="text-white text-sm text-outfit">${selectedInvoice.amount_due}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Due Date</span>
                    <strong className="text-white text-sm text-outfit">{selectedInvoice.due_date}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Late Fee</span>
                    <strong className="text-rose-400 font-bold">${selectedInvoice.late_fee}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Payment Method</span>
                    <strong className="text-slate-300">{selectedInvoice.breakdown.payment_method}</strong>
                  </div>
                </div>
                {selectedInvoice.status !== 'paid' && selectedInvoice.actions.can_mark_as_paid && (
                  <button 
                    onClick={() => handleMarkPaidWithNotification(selectedInvoice.id)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 py-2.5 rounded-xl font-bold text-white text-xs shadow-md shadow-emerald-600/10 transition-all text-outfit mt-2"
                  >
                    Mark Invoice as Paid (Notify Tenant)
                  </button>
                )}
              </div>
            )}

            {/* Tenant & Lease Details Lookup */}
            <div className="flex flex-col gap-3 border-b border-white/5 pb-4">
              <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Tenant & Lease File</h4>
              {(() => {
                const det = getMockTenantDetails(selectedInvoice.lease_id);
                return (
                  <div className="flex flex-col gap-2 text-xs bg-slate-950/40 p-3 rounded-xl border border-white/5">
                    <div>
                      <span className="text-slate-500 block">Tenant Name</span>
                      <strong className="text-white text-sm">{det.tenantName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Contact</span>
                      <span className="text-slate-300 block">{det.email}</span>
                      <span className="text-slate-400 block">{det.phone}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-2 mt-1">
                      <div>
                        <span className="text-slate-500 block">Property / Unit</span>
                        <strong className="text-slate-300">{det.property}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Lease Term</span>
                        <strong className="text-slate-300">{det.term}</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Timeline complete history */}
            <div className="flex flex-col gap-3 border-b border-white/5 pb-4">
              <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Invoice Event Log</h4>
              <div className="max-h-[140px] overflow-y-auto pr-1">
                <TimelineView data={selectedInvoice.timeline} />
              </div>
            </div>

            {/* Dynamic Notes Section */}
            <div className="flex flex-col gap-3 flex-1">
              <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Bookkeeping Notes</h4>
              <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1">
                {(invoiceNotes[selectedInvoice.id] || []).map((note, idx) => (
                  <div key={idx} className="text-xs bg-white/5 border border-white/5 rounded-xl p-3 text-slate-300">
                    {note}
                  </div>
                ))}
                {(invoiceNotes[selectedInvoice.id] || []).length === 0 && (
                  <span className="text-slate-500 text-xs italic p-1">No notes recorded for this invoice yet.</span>
                )}
              </div>

              {/* Add Note Form */}
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
        )}

      </div>
    </div>
  );
};
