import { useState } from 'react';
import { Invoice } from '../../types/invoice';
import { TimelineView } from './TimelineView';

interface InvoiceDetailModalProps {
  invoice: Invoice;
  onClose: () => void;
  onMarkAsPaid: (id: string) => void;
}

export const InvoiceDetailModal = ({ invoice, onClose, onMarkAsPaid }: InvoiceDetailModalProps) => {
  const [activeTab, setActiveTab] = useState<'payment_timeline' | 'invoice_breakdown'>('payment_timeline');

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative backdrop-blur-2xl">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-slate-400 hover:text-white font-bold text-lg"
        >
          ✕
        </button>
        <h3 className="text-xl font-bold text-white mb-2 text-outfit">Invoice Detail: {invoice.id}</h3>
        
        {/* Header Actions */}
        <div className="flex gap-4 mb-6">
          {invoice.actions.can_mark_as_paid && invoice.status !== 'paid' && (
            <button 
              onClick={() => { onMarkAsPaid(invoice.id); }} 
              className="text-xs bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-white font-bold shadow-lg shadow-emerald-600/20 transition-all duration-150"
            >
              Mark as Paid
            </button>
          )}
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-white/5 mb-4">
          <button 
            onClick={() => setActiveTab('payment_timeline')} 
            className={`px-4 py-2 text-sm font-semibold border-b-2 text-outfit transition-all duration-150 ${
              activeTab === 'payment_timeline' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Payment Timeline
          </button>
          <button 
            onClick={() => setActiveTab('invoice_breakdown')} 
            className={`px-4 py-2 text-sm font-semibold border-b-2 text-outfit transition-all duration-150 ${
              activeTab === 'invoice_breakdown' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Breakdown
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'payment_timeline' ? (
          <TimelineView data={invoice.timeline} />
        ) : (
          <div className="grid grid-cols-2 gap-6 bg-slate-950/40 p-6 rounded-xl border border-white/5">
            <div>
              <span className="text-xs text-slate-400 block font-bold text-outfit">Base Rent</span>
              <span className="text-xl font-extrabold text-white text-outfit">${invoice.breakdown.base_rent}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-bold text-outfit">Late Fee</span>
              <span className="text-xl font-extrabold text-rose-400 text-outfit">${invoice.breakdown.late_fee}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-bold text-outfit">Total Due</span>
              <span className="text-xl font-extrabold text-emerald-400 text-outfit">${invoice.breakdown.total_due}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-bold text-outfit">Payment Method</span>
              <span className="text-sm text-slate-300 font-semibold">{invoice.breakdown.payment_method}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
