import { useState } from 'react';

type ReportTabType = 'cashflow' | 'schedule_e' | 'rent_roll' | 'delinquency';

export const Reports = () => {
  const [activeReportTab, setActiveReportTab] = useState<ReportTabType>('cashflow');
  const [showSubcategories, setShowSubcategories] = useState(true);

  // Cashflow report data
  const months = ['Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026'];
  const reportsData = {
    revenue: [26600, 26600, 26600, 26600, 26600, 26600],
    subRevenue: {
      rent: [26600, 26600, 26600, 26600, 26600, 26600]
    },
    propertyTransactions: [0, 0, 0, 0, 0, 0],
    transfersOther: [0, 0, 0, 0, 0, 0],
    expenses: [-3850, -4120, -3950, -5200, -3850, -4100],
    subExpenses: {
      repairs: [-350, -620, -450, -1200, -350, -600],
      taxes: [-1200, -1200, -1200, -1200, -1200, -1200],
      utilities: [-2300, -2300, -2300, -2800, -2300, -2300]
    },
    loanCapex: [-6200, -6200, -6200, -6200, -6200, -6200],
    nonPropertyExpense: [0, 0, 0, 0, 0, 0],
    uncategorized: [1299, -26, 65, -16579, -2132, -749]
  };

  // Schedule E Tax Data
  const scheduleECategories = [
    { code: '3', name: 'Advertising', amount: -450 },
    { code: '4', name: 'Auto and Travel', amount: -850 },
    { code: '5', name: 'Cleaning and Maintenance', amount: -2100 },
    { code: '9', name: 'Insurance', amount: -3600 },
    { code: '10', name: 'Legal and Professional Fees', amount: -1250 },
    { code: '12', name: 'Mortgage Interest Paid to Banks', amount: -18600 },
    { code: '14', name: 'Repairs', amount: -3570 },
    { code: '16', name: 'Taxes', amount: -7200 },
    { code: '17', name: 'Utilities', amount: -14300 },
  ];

  // Rent Roll Data
  const rentRollData = [
    { property: 'Oakridge', unit: '#101', tenant: 'Jane Doe', status: 'Delinquent', rent: 1400, balance: 1800 },
    { property: 'Pacific Heights', unit: '#4', tenant: 'John Smith', status: 'Current', rent: 1350, balance: 0 },
    { property: 'Oakridge', unit: '#102', tenant: 'Alice Cooper', status: 'Current', rent: 1500, balance: 0 },
    { property: 'Pacific Heights', unit: '#12', tenant: 'Bob Marley', status: 'Grace Period', rent: 1600, balance: 400 },
  ];

  // Delinquency Data
  const delinquencyData = [
    { tenant: 'Jane Doe', unit: 'Oakridge #101', overdueAmount: 1800, lateFees: 150, voucher: 'Fulton County HA ($900)', plan: '$1000 - 10/11, $966.75 - 10/25', action: 'Eviction Warning Issued' },
    { tenant: 'Bob Marley', unit: 'Pacific Heights #12', overdueAmount: 400, lateFees: 50, voucher: 'None', plan: 'Promise to pay by Friday', action: 'Pending Late Fee assessment' },
  ];

  const calculateTotal = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const formatVal = (val: number) => {
    if (val === 0) return '$0';
    if (val < 0) return `-$${Math.abs(val).toLocaleString()}`;
    return `+$${val.toLocaleString()}`;
  };

  const calculateNOI = (index: number) => reportsData.revenue[index] + reportsData.expenses[index];
  const noiArray = months.map((_, idx) => calculateNOI(idx));
  const totalNOI = calculateTotal(noiArray);

  const calculateNetCashFlow = (index: number) => {
    return calculateNOI(index) + reportsData.loanCapex[index] + reportsData.nonPropertyExpense[index] + reportsData.transfersOther[index];
  };
  const cashFlowArray = months.map((_, idx) => calculateNetCashFlow(idx));
  const totalCashFlow = calculateTotal(cashFlowArray);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            Financial & Operations Reports
          </h1>
          <p className="text-slate-400 text-sm mt-1">Multi-dimensional operational ledger and IRS tax reporting statements</p>
        </div>

        {/* Global statement controls */}
        <div className="flex gap-2 bg-slate-900/50 p-1 rounded-xl border border-white/5 text-xs font-semibold text-outfit">
          <button className="px-4 py-2 hover:bg-white/5 rounded-lg text-slate-400">All Properties</button>
          <button className="px-4 py-2 hover:bg-white/5 rounded-lg text-slate-400">FY 2026</button>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex border-b border-white/5 gap-6 text-outfit text-sm font-semibold">
        <button
          onClick={() => setActiveReportTab('cashflow')}
          className={`pb-3 transition-colors ${
            activeReportTab === 'cashflow' ? 'border-b-2 border-indigo-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Cash Flow & NOI
        </button>
        <button
          onClick={() => setActiveReportTab('schedule_e')}
          className={`pb-3 transition-colors ${
            activeReportTab === 'schedule_e' ? 'border-b-2 border-indigo-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          IRS Schedule E Preparer
        </button>
        <button
          onClick={() => setActiveReportTab('rent_roll')}
          className={`pb-3 transition-colors ${
            activeReportTab === 'rent_roll' ? 'border-b-2 border-indigo-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Rent Roll Rollup
        </button>
        <button
          onClick={() => setActiveReportTab('delinquency')}
          className={`pb-3 transition-colors ${
            activeReportTab === 'delinquency' ? 'border-b-2 border-indigo-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Delinquency & Voucher Audit
        </button>
      </div>

      <div className="flex items-center justify-between">
        {activeReportTab === 'cashflow' ? (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={showSubcategories}
              onChange={() => setShowSubcategories(p => !p)}
              className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-white/10 focus:ring-indigo-500"
            />
            <span className="text-sm font-semibold text-slate-300">Show sub-categories</span>
          </label>
        ) : <div />}
        
        <button className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md shadow-indigo-600/20 transition-all text-outfit">
          Export Document
        </button>
      </div>

      {/* Reports Table Grid */}
      <div className="overflow-x-auto glass-panel rounded-2xl">
        {activeReportTab === 'cashflow' && (
          <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
            <thead className="bg-white/5 text-[10px] text-slate-400 font-bold uppercase tracking-wider text-outfit">
              <tr>
                <th className="px-6 py-4 min-w-[200px]">Report Statement Field</th>
                {months.map(m => <th key={m} className="px-4 py-4 text-right">{m}</th>)}
                <th className="px-6 py-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent text-sm">
              <tr className="hover:bg-white/5 font-bold text-slate-200">
                <td className="px-6 py-4">Revenue</td>
                {reportsData.revenue.map((val, idx) => <td key={idx} className="px-4 py-4 text-right text-emerald-400">{formatVal(val)}</td>)}
                <td className="px-6 py-4 text-right text-emerald-400 font-extrabold">{formatVal(calculateTotal(reportsData.revenue))}</td>
              </tr>
              {showSubcategories && (
                <tr className="text-xs text-slate-400 italic">
                  <td className="px-10 py-3">↳ Rent Received</td>
                  {reportsData.subRevenue.rent.map((val, idx) => <td key={idx} className="px-4 py-3 text-right">{formatVal(val)}</td>)}
                  <td className="px-6 py-3 text-right font-semibold">{formatVal(calculateTotal(reportsData.subRevenue.rent))}</td>
                </tr>
              )}

              <tr className="bg-white/5 font-extrabold text-white">
                <td className="px-6 py-4 text-outfit text-indigo-400">Net Operating Income (NOI)</td>
                {noiArray.map((val, idx) => <td key={idx} className="px-4 py-4 text-right text-indigo-300">{formatVal(val)}</td>)}
                <td className="px-6 py-4 text-right text-indigo-300 font-extrabold">{formatVal(totalNOI)}</td>
              </tr>

              <tr className="hover:bg-white/5 text-slate-300">
                <td className="px-6 py-4">Property Transactions</td>
                {reportsData.propertyTransactions.map((val, idx) => <td key={idx} className="px-4 py-4 text-right">{formatVal(val)}</td>)}
                <td className="px-6 py-4 text-right font-bold">{formatVal(calculateTotal(reportsData.propertyTransactions))}</td>
              </tr>

              <tr className="hover:bg-white/5 text-slate-300">
                <td className="px-6 py-4">Transfers & Other</td>
                {reportsData.transfersOther.map((val, idx) => <td key={idx} className="px-4 py-4 text-right">{formatVal(val)}</td>)}
                <td className="px-6 py-4 text-right font-bold">{formatVal(calculateTotal(reportsData.transfersOther))}</td>
              </tr>

              <tr className="hover:bg-white/5 font-bold text-slate-200">
                <td className="px-6 py-4">Operating Expenses</td>
                {reportsData.expenses.map((val, idx) => <td key={idx} className="px-4 py-4 text-right text-rose-400">{formatVal(val)}</td>)}
                <td className="px-6 py-4 text-right text-rose-400 font-extrabold">{formatVal(calculateTotal(reportsData.expenses))}</td>
              </tr>
              {showSubcategories && (
                <>
                  <tr className="text-xs text-slate-400">
                    <td className="px-10 py-3">↳ Repairs</td>
                    {reportsData.subExpenses.repairs.map((val, idx) => <td key={idx} className="px-4 py-3 text-right">{formatVal(val)}</td>)}
                    <td className="px-6 py-3 text-right font-semibold">{formatVal(calculateTotal(reportsData.subExpenses.repairs))}</td>
                  </tr>
                  <tr className="text-xs text-slate-400">
                    <td className="px-10 py-3">↳ Taxes</td>
                    {reportsData.subExpenses.taxes.map((val, idx) => <td key={idx} className="px-4 py-3 text-right">{formatVal(val)}</td>)}
                    <td className="px-6 py-3 text-right font-semibold">{formatVal(calculateTotal(reportsData.subExpenses.taxes))}</td>
                  </tr>
                  <tr className="text-xs text-slate-400">
                    <td className="px-10 py-3">↳ Utilities</td>
                    {reportsData.subExpenses.utilities.map((val, idx) => <td key={idx} className="px-4 py-3 text-right">{formatVal(val)}</td>)}
                    <td className="px-6 py-3 text-right font-semibold">{formatVal(calculateTotal(reportsData.subExpenses.utilities))}</td>
                  </tr>
                </>
              )}

              <tr className="hover:bg-white/5 text-slate-300">
                <td className="px-6 py-4">Loan Payments & Capex</td>
                {reportsData.loanCapex.map((val, idx) => <td key={idx} className="px-4 py-4 text-right">{formatVal(val)}</td>)}
                <td className="px-6 py-4 text-right font-bold">{formatVal(calculateTotal(reportsData.loanCapex))}</td>
              </tr>

              <tr className="hover:bg-white/5 text-slate-300">
                <td className="px-6 py-4">Non-Property Expense</td>
                {reportsData.nonPropertyExpense.map((val, idx) => <td key={idx} className="px-4 py-4 text-right">{formatVal(val)}</td>)}
                <td className="px-6 py-4 text-right font-bold">{formatVal(calculateTotal(reportsData.nonPropertyExpense))}</td>
              </tr>

              <tr className="bg-indigo-950/20 font-extrabold text-white">
                <td className="px-6 py-4 text-outfit text-indigo-400">Net Cash Flow</td>
                {cashFlowArray.map((val, idx) => <td key={idx} className="px-4 py-4 text-right text-emerald-400">{formatVal(val)}</td>)}
                <td className="px-6 py-4 text-right text-emerald-400 font-extrabold">{formatVal(totalCashFlow)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {activeReportTab === 'schedule_e' && (
          <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
            <thead className="bg-white/5 text-[10px] text-slate-400 font-bold uppercase tracking-wider text-outfit">
              <tr>
                <th className="px-6 py-4">IRS Code</th>
                <th className="px-6 py-4">Schedule E Expense Category</th>
                <th className="px-6 py-4 text-right">Annual Deductions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent text-sm">
              {scheduleECategories.map((cat, idx) => (
                <tr key={idx} className="hover:bg-white/5 text-slate-300">
                  <td className="px-6 py-4 font-mono text-slate-500">{cat.code}</td>
                  <td className="px-6 py-4 font-semibold text-slate-200">{cat.name}</td>
                  <td className="px-6 py-4 text-right text-rose-400 font-bold">{formatVal(cat.amount)}</td>
                </tr>
              ))}
              <tr className="bg-white/5 font-extrabold text-white">
                <td className="px-6 py-4"></td>
                <td className="px-6 py-4 text-outfit text-indigo-400">Total Schedule E Write-offs</td>
                <td className="px-6 py-4 text-right text-rose-400 font-extrabold">
                  {formatVal(scheduleECategories.reduce((sum, c) => sum + c.amount, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {activeReportTab === 'rent_roll' && (
          <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
            <thead className="bg-white/5 text-[10px] text-slate-400 font-bold uppercase tracking-wider text-outfit">
              <tr>
                <th className="px-6 py-4">Property / Location</th>
                <th className="px-6 py-4">Unit</th>
                <th className="px-6 py-4">Current Tenant</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Lease Rent</th>
                <th className="px-6 py-4 text-right">Ledger Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent text-sm">
              {rentRollData.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/5 text-slate-300">
                  <td className="px-6 py-4 font-semibold text-slate-200">{row.property}</td>
                  <td className="px-6 py-4 font-mono">{row.unit}</td>
                  <td className="px-6 py-4">{row.tenant}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      row.status === 'Current' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : row.status === 'Delinquent'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-200">${row.rent}</td>
                  <td className={`px-6 py-4 text-right font-bold ${row.balance > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    ${row.balance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeReportTab === 'delinquency' && (
          <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
            <thead className="bg-white/5 text-[10px] text-slate-400 font-bold uppercase tracking-wider text-outfit">
              <tr>
                <th className="px-6 py-4">Tenant / Unit</th>
                <th className="px-6 py-4 text-right">Arrears Balance</th>
                <th className="px-6 py-4 text-right">Unpaid Late Fees</th>
                <th className="px-6 py-4">Assistance Voucher</th>
                <th className="px-6 py-4">Arrangement Plan</th>
                <th className="px-6 py-4 text-right">Workflow Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent text-sm">
              {delinquencyData.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/5 text-slate-300 align-top">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-200">{row.tenant}</div>
                    <div className="text-xs text-slate-500">{row.unit}</div>
                  </td>
                  <td className="px-6 py-4 text-right text-rose-400 font-bold">${row.overdueAmount}</td>
                  <td className="px-6 py-4 text-right text-amber-500 font-semibold">${row.lateFees}</td>
                  <td className="px-6 py-4">
                    <span className={row.voucher !== 'None' ? 'text-indigo-400 font-medium' : 'text-slate-500'}>
                      {row.voucher}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-300">{row.plan}</td>
                  <td className="px-6 py-4 text-right text-rose-400 font-bold text-xs">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
