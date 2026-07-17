import { useState } from 'react';

export const Bookkeeping = () => {
  const [viewType, setViewType] = useState<'real_estate' | 'personal'>('real_estate');

  const realEstateBookkeeping = [
    { id: 'RE-1', description: 'Monthly Rent - Jane Doe', amount: 1400, category: 'Rent Received', flag: 'auto' },
    { id: 'RE-2', description: 'HVAC Duct Repair', amount: -350, category: 'Repairs', flag: 'auto' },
    { id: 'RE-3', description: 'Property Tax Payment', amount: -1200, category: 'Taxes', flag: 'auto' },
    { id: 'RE-4', description: 'Home Depot Supplies', amount: -85, category: 'Supplies', flag: 'manual_review_required' },
  ];

  const personalBookkeeping = [
    { id: 'P-1', description: 'ONELIFE VICKERY SPORTS C', amount: -200, category: 'Health & Wellness', flag: 'auto' },
    { id: 'P-2', description: 'Uber Eats Dinner', amount: -42, category: 'Food & Dining', flag: 'auto' },
    { id: 'P-3', description: 'Delta Air Lines Flight', amount: -450, category: 'Travel', flag: 'auto' },
  ];

  const activeItems = viewType === 'real_estate' ? realEstateBookkeeping : personalBookkeeping;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            Bookkeeping Ledger
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage private business accounts and personal expenses</p>
        </div>
        
        {/* Toggle View */}
        <div className="flex gap-2 bg-slate-900/50 p-1.5 rounded-xl border border-white/5">
          <button 
            onClick={() => setViewType('real_estate')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all text-outfit ${
              viewType === 'real_estate' 
                ? 'bg-indigo-600 text-white shadow' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Real Estate (Schedule E)
          </button>
          <button 
            onClick={() => setViewType('personal')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all text-outfit ${
              viewType === 'personal' 
                ? 'bg-indigo-600 text-white shadow' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Personal Accounts
          </button>
        </div>
      </div>

      <div className="overflow-hidden glass-panel rounded-2xl">
        <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
          <thead className="bg-white/5">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Description</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Account Class / Category</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Classification</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-transparent">
            {activeItems.map(item => (
              <tr key={item.id} className="hover:bg-white/5 transition-all duration-150">
                <td className="px-6 py-4 text-white font-bold text-outfit text-sm">{item.description}</td>
                <td className="px-6 py-4 text-sm text-slate-300">{item.category}</td>
                <td className="px-6 py-4 text-sm">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    item.flag === 'auto' 
                      ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {item.flag === 'auto' ? 'Auto-Categorized' : 'Needs Review'}
                  </span>
                </td>
                <td className={`px-6 py-4 text-sm font-extrabold text-outfit ${item.amount > 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {item.amount > 0 ? `+$${item.amount}` : `-$${Math.abs(item.amount)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
