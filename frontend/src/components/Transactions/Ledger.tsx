import { useMemo, useState } from 'react';
import { useTransactions, Transaction, TransactionInput } from '../../hooks/useTransactions';

const CATEGORIES = [
  'Rent Received', 'Repairs', 'Supplies', 'Taxes', 'Utilities', 'Insurance',
  'Cleaning and Maintenance', 'Advertising', 'Auto and Travel',
  'Legal and Other Professional Fees', 'Mortgage Interest Paid to Banks',
  'Other Expenses', 'Health & Wellness', 'Food & Dining', 'Travel',
];

const emptyAdd = () => ({
  description: '',
  amount: '',
  transaction_date: new Date().toISOString().split('T')[0],
  category: 'Repairs',
  account_class: 'real_estate' as 'real_estate' | 'personal',
});

export const Ledger = () => {
  const [classFilter, setClassFilter] = useState<'all' | 'real_estate' | 'personal'>('all');
  const { transactions, createTransaction, updateTransaction } = useTransactions(
    classFilter === 'all' ? {} : { account_class: classFilter }
  );

  const [selectedItem, setSelectedItem] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd());

  const handleOpenDetails = (item: Transaction) => {
    setSelectedItem(item);
    setMemoInput(item.memo);
  };

  const handleSaveMemo = async () => {
    if (!selectedItem) return;
    await updateTransaction({ id: selectedItem.id, memo: memoInput });
    setSelectedItem({ ...selectedItem, memo: memoInput });
  };

  const handleChangeCategory = async (category: string) => {
    if (!selectedItem) return;
    await updateTransaction({ id: selectedItem.id, category });
    setSelectedItem({ ...selectedItem, category });
  };

  const handleApprove = async () => {
    if (!selectedItem) return;
    await updateTransaction({ id: selectedItem.id, reviewed: true });
    setSelectedItem({ ...selectedItem, reviewed: true });
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: TransactionInput = {
      description: addForm.description,
      amount: -Math.abs(Number(addForm.amount)), // expenses are negative
      transaction_date: addForm.transaction_date,
      category: addForm.category,
      account_class: addForm.account_class,
    };
    await createTransaction(input);
    setAddForm(emptyAdd());
    setIsAddOpen(false);
  };

  const filtered = useMemo(() => {
    if (!searchQuery) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(
      (t) => t.description.toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  return (
    <div className="glass-panel p-6 rounded-2xl flex flex-col gap-6">
      {/* Top action row */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/5 pb-4">
        {/* Class filter */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Class</span>
          {(['all', 'real_estate', 'personal'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setClassFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                classFilter === c
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10'
                  : 'bg-white/5 text-slate-400 border-white/5 hover:text-slate-200'
              }`}
            >
              {c === 'all' ? 'All' : c === 'real_estate' ? 'Real estate' : 'Personal'}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setAddForm(emptyAdd()); setIsAddOpen(true); }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
          >
            + Add expense
          </button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/5 text-slate-300" title="Coming in Phase 2">
            📤 Upload CSV
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 max-w-xs"
        />
      </div>

      {/* Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-white/5">
        <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
          <thead className="bg-white/5 text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">
            <tr>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Description</th>
              <th className="px-6 py-4 text-right">Amount</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">Class</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-transparent text-sm">
            {filtered.map((item) => (
              <tr
                key={item.id}
                onClick={() => handleOpenDetails(item)}
                className="hover:bg-white/5 transition-all duration-150 cursor-pointer align-middle"
              >
                <td className="px-6 py-4 text-slate-400">{item.transaction_date}</td>
                <td className="px-6 py-4 font-bold text-white text-outfit">{item.description}</td>
                <td className={`px-6 py-4 text-right font-extrabold text-outfit ${item.amount > 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {item.amount > 0 ? `+$${item.amount.toLocaleString()}` : `-$${Math.abs(item.amount).toLocaleString()}`}
                </td>
                <td className="px-6 py-4 text-xs font-semibold text-indigo-400">{item.category}</td>
                <td className="px-6 py-4 text-xs text-slate-400">
                  {item.account_class === 'real_estate' ? 'Real estate' : 'Personal'}
                </td>
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
        {filtered.length === 0 && (
          <div className="p-10 text-center text-slate-500 text-sm">No transactions yet.</div>
        )}
      </div>

      {/* Transaction Detail Modal */}
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
              <div className="flex justify-between items-center bg-slate-950/40 p-4 rounded-xl border border-white/5">
                <div>
                  <span className="text-xs text-slate-400 block font-bold uppercase tracking-wider text-outfit">Amount</span>
                  <span className={`text-2xl font-extrabold text-outfit ${selectedItem.amount > 0 ? 'text-emerald-400' : 'text-white'}`}>
                    {selectedItem.amount > 0 ? `+$${selectedItem.amount.toLocaleString()}` : `-$${Math.abs(selectedItem.amount).toLocaleString()}`}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block font-bold uppercase tracking-wider text-outfit">Date</span>
                  <span className="text-sm font-semibold text-slate-300">{selectedItem.transaction_date}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Description</span>
                  <span className="text-white font-semibold">{selectedItem.description}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Source</span>
                  <span className="text-slate-300 text-xs capitalize">{selectedItem.source}</span>
                </div>
                {selectedItem.payment_method && (
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Payment Method</span>
                    <span className="text-slate-300 text-xs">{selectedItem.payment_method}</span>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Class</span>
                  <span className="text-slate-300 text-xs">
                    {selectedItem.account_class === 'real_estate' ? 'Real estate' : 'Personal'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-4 border-t border-white/5 pt-4">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Category Classification</span>
                  <select
                    value={selectedItem.category}
                    onChange={(e) => handleChangeCategory(e.target.value)}
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-indigo-400 focus:outline-none focus:border-indigo-500 w-full"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Memo Notes</span>
                  <textarea
                    value={memoInput}
                    onChange={(e) => setMemoInput(e.target.value)}
                    placeholder="Type memo details and save..."
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 w-full h-20 resize-none"
                  />
                  <div className="flex justify-end items-center mt-2">
                    <button
                      onClick={handleSaveMemo}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg text-white font-bold transition-all"
                    >
                      Save Memo
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-white/5 pt-4">
                <button onClick={() => setSelectedItem(null)} className="text-xs text-slate-400 hover:text-slate-200 font-semibold">
                  Close Details
                </button>
                {!selectedItem.reviewed && (
                  <button
                    onClick={handleApprove}
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

      {/* Add Expense Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white text-outfit">Add Expense</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
            </div>
            <form onSubmit={handleAddExpense} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Description</label>
                <input
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  required
                  placeholder="e.g. Plumbing repair"
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Amount ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={addForm.amount}
                    onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                    required
                    placeholder="85.00"
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Date</label>
                  <input
                    type="date"
                    value={addForm.transaction_date}
                    onChange={(e) => setAddForm({ ...addForm, transaction_date: e.target.value })}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Category</label>
                  <select
                    value={addForm.category}
                    onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Class</label>
                  <select
                    value={addForm.account_class}
                    onChange={(e) => setAddForm({ ...addForm, account_class: e.target.value as 'real_estate' | 'personal' })}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="real_estate">Real estate</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 text-outfit">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all text-outfit">Add Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
