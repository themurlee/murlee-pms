import { useState } from 'react';

interface LedgerItem {
  id: string;
  date: string;
  postedDate: string;
  account: string;
  description: string;
  amount: number;
  category: string;
  property: string;
  note: string;
  reviewed: boolean;
  merchantType?: string;
  method?: string;
  cardNumber?: string;
}

export const Ledger = () => {
  const initialLedger: LedgerItem[] = [
    { 
      id: 'L-1', 
      date: '2024-09-15', 
      postedDate: '2024-09-16', 
      account: 'Chase Checking (...7981)', 
      description: 'ONELIFE VICKERY SPORTS C', 
      amount: -200.00, 
      category: 'Health & Wellness', 
      property: 'None (Personal)', 
      note: 'Monthly health club subscription.', 
      reviewed: false,
      merchantType: 'Membership clubs, country clubs, private golf courses',
      method: 'Online, mail or phone',
      cardNumber: '(...7981)'
    },
    { 
      id: 'L-2', 
      date: '2026-07-10', 
      postedDate: '2026-07-11', 
      account: 'Plaid Business ACH', 
      description: 'Monthly Rent - Jane Doe', 
      amount: 1400.00, 
      category: 'Rent Received', 
      property: 'Oakridge Manor', 
      note: '', 
      reviewed: true 
    },
    { 
      id: 'L-3', 
      date: '2026-07-08', 
      postedDate: '2026-07-09', 
      account: 'Home Depot Commercial Card', 
      description: 'Home Depot supplies', 
      amount: -85.00, 
      category: 'Supplies', 
      property: 'Oakridge Manor', 
      note: 'Need to review tax allocation', 
      reviewed: false 
    },
    { 
      id: 'L-4', 
      date: '2026-07-05', 
      postedDate: '2026-07-06', 
      account: 'Plaid Business ACH', 
      description: 'Plumbing Repair Service', 
      amount: -350.00, 
      category: 'Repairs', 
      property: 'Pacific Breeze', 
      note: 'Emergency hot water tank repair', 
      reviewed: true 
    },
  ];

  const [ledger, setLedger] = useState<LedgerItem[]>(initialLedger);
  const [selectedItem, setSelectedItem] = useState<LedgerItem | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'missing_category' | 'missing_property'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [memoInput, setMemoInput] = useState('');

  const handleOpenDetails = (item: LedgerItem) => {
    setSelectedItem(item);
    setMemoInput(item.note);
  };

  const handleSaveMemo = () => {
    if (selectedItem) {
      setLedger(prev => prev.map(item => 
        item.id === selectedItem.id ? { ...item, note: memoInput } : item
      ));
      setSelectedItem(prev => prev ? { ...prev, note: memoInput } : null);
    }
  };

  const handleApprove = (id: string) => {
    setLedger(prev => prev.map(item => 
      item.id === id ? { ...item, reviewed: true } : item
    ));
    if (selectedItem?.id === id) {
      setSelectedItem(prev => prev ? { ...prev, reviewed: true } : null);
    }
  };

  // Filter logic matching Baselane screenshot quick filters
  const filteredLedger = ledger.filter(item => {
    if (filterType === 'missing_category') return item.category === '' || item.category === 'None';
    if (filterType === 'missing_property') return item.property === '' || item.property === 'None (Personal)';
    
    if (searchQuery) {
      return item.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
             item.category.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="glass-panel p-6 rounded-2xl flex flex-col gap-6">
      {/* Top action row */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/5 pb-4">
        {/* Quick filters */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Quick filters</span>
          <button 
            onClick={() => setFilterType(filterType === 'missing_category' ? 'all' : 'missing_category')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              filterType === 'missing_category' 
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10' 
                : 'bg-white/5 text-slate-400 border-white/5 hover:text-slate-200'
            }`}
          >
            🔍 Missing category
          </button>
          <button 
            onClick={() => setFilterType(filterType === 'missing_property' ? 'all' : 'missing_property')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              filterType === 'missing_property' 
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10' 
                : 'bg-white/5 text-slate-400 border-white/5 hover:text-slate-200'
            }`}
          >
            🏢 Missing property
          </button>
        </div>

        {/* Global bookkeeping buttons */}
        <div className="flex gap-2">
          <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            ✨ Automate Bookkeeping
          </button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/5 text-slate-300">
            📤 Upload Receipts
          </button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/5 text-slate-300">
            📥 Export
          </button>
        </div>
      </div>

      {/* Filter Options Row */}
      <div className="flex gap-3 flex-wrap items-center">
        <input 
          type="text" 
          placeholder="Search transactions..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 max-w-xs"
        />
        <select className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400">
          <option>Review Status</option>
        </select>
        <select className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400">
          <option>Date Range</option>
        </select>
        <select className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400">
          <option>Property</option>
        </select>
      </div>

      {/* Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-white/5">
        <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
          <thead className="bg-white/5 text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">
            <tr>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Account</th>
              <th className="px-6 py-4">Description</th>
              <th className="px-6 py-4 text-right">Amount</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">Property</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-transparent text-sm">
            {filteredLedger.map(item => (
              <tr 
                key={item.id} 
                onClick={() => handleOpenDetails(item)}
                className="hover:bg-white/5 transition-all duration-150 cursor-pointer align-middle"
              >
                <td className="px-6 py-4 text-slate-400">{item.date}</td>
                <td className="px-6 py-4 text-slate-300 text-xs font-mono">{item.account}</td>
                <td className="px-6 py-4 font-bold text-white text-outfit">{item.description}</td>
                <td className={`px-6 py-4 text-right font-extrabold text-outfit ${item.amount > 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {item.amount > 0 ? `+$${item.amount}` : `-$${Math.abs(item.amount)}`}
                </td>
                <td className="px-6 py-4 text-xs font-semibold text-indigo-400">{item.category}</td>
                <td className="px-6 py-4 text-xs text-slate-400">{item.property}</td>
                <td className="px-6 py-4 text-xs">
                  {item.reviewed ? (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase">Reviewed</span>
                  ) : (
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold uppercase">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Baselane Transaction Detail Modal matching screenshot f14ae1b9-15e0-4c13-be5f-f14f84f9175a.png */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setSelectedItem(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white font-bold text-lg"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold text-white mb-6 text-outfit border-b border-white/5 pb-2">Transaction Details</h3>

            <div className="flex flex-col gap-6">
              {/* Header Amount */}
              <div className="flex justify-between items-center bg-slate-950/40 p-4 rounded-xl border border-white/5">
                <div>
                  <span className="text-xs text-slate-400 block font-bold uppercase tracking-wider text-outfit">Amount</span>
                  <span className={`text-2xl font-extrabold text-outfit ${selectedItem.amount > 0 ? 'text-emerald-400' : 'text-white'}`}>
                    {selectedItem.amount > 0 ? `+$${selectedItem.amount}` : `-$${Math.abs(selectedItem.amount)}`}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block font-bold uppercase tracking-wider text-outfit">Date</span>
                  <span className="text-sm font-semibold text-slate-300">{selectedItem.date}</span>
                </div>
              </div>

              {/* Transaction Specs */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Description</span>
                  <span className="text-white font-semibold">{selectedItem.description}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Account Channel</span>
                  <span className="text-slate-300 font-mono text-xs">{selectedItem.account}</span>
                </div>
                {selectedItem.merchantType && (
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Merchant Type</span>
                    <span className="text-slate-300 text-xs">{selectedItem.merchantType}</span>
                  </div>
                )}
                {selectedItem.method && (
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Method</span>
                    <span className="text-slate-300 text-xs">{selectedItem.method}</span>
                  </div>
                )}
              </div>

              {/* Editable Category and Memo */}
              <div className="flex flex-col gap-4 border-t border-white/5 pt-4">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Category Classification</span>
                  <select 
                    value={selectedItem.category} 
                    onChange={(e) => {
                      const cat = e.target.value;
                      setLedger(prev => prev.map(item => item.id === selectedItem.id ? { ...item, category: cat } : item));
                      setSelectedItem(prev => prev ? { ...prev, category: cat } : null);
                    }}
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-indigo-400 focus:outline-none focus:border-indigo-500 w-full"
                  >
                    <option value="Rent Received">Rent Received (Real Estate)</option>
                    <option value="Repairs">Repairs (Real Estate)</option>
                    <option value="Supplies">Supplies (Real Estate)</option>
                    <option value="Taxes">Taxes (Real Estate)</option>
                    <option value="Utilities">Utilities (Real Estate)</option>
                    <option value="Health & Wellness">Health & Wellness (Personal)</option>
                    <option value="Food & Dining">Food & Dining (Personal)</option>
                    <option value="Travel">Travel (Personal)</option>
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Memo Notes</span>
                  <textarea 
                    value={memoInput}
                    onChange={(e) => setMemoInput(e.target.value)}
                    placeholder="Type memo details and save..."
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 w-full h-20 placeholder-slate-650 resize-none"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] text-slate-500 font-medium">200 characters limit</span>
                    <button 
                      onClick={handleSaveMemo}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg text-white font-bold transition-all"
                    >
                      Save Memo
                    </button>
                  </div>
                </div>
              </div>

              {/* Mutating Action Buttons */}
              <div className="flex justify-between items-center border-t border-white/5 pt-4">
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 font-semibold"
                >
                  Close Details
                </button>
                {!selectedItem.reviewed && (
                  <button 
                    onClick={() => handleApprove(selectedItem.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white px-4 py-2 rounded-lg shadow-md shadow-emerald-600/10 transition-all"
                  >
                    Approve Match
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
