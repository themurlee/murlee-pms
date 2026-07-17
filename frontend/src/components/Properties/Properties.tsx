import { useState } from 'react';

interface Property {
  id: string;
  name: string;
  units: number;
  income: number;
  address: string;
}

export const Properties = () => {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const [properties, setProperties] = useState<Property[]>([
    { id: '1', name: 'Oakridge Manor', units: 12, income: 15400, address: '128 Oakridge Dr' },
    { id: '2', name: 'Pacific Breeze', units: 8, income: 11200, address: '445 Coastline Hwy' },
  ]);

  // Form modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [units, setUnits] = useState(1);
  const [income, setIncome] = useState(1000);

  interface Tenant {
    id: string;
    name: string;
    email: string;
    phone: string;
    unit: string;
    rent: number;
  }

  interface Payment {
    id: string;
    month: string;
    amount: number;
    status: string;
  }

  interface MaintenanceRequest {
    id: string;
    issue: string;
    status: string;
  }

  // Mock data mapping to property IDs
  const tenantsByProperty: Record<string, Tenant[]> = {
    '1': [
      { id: 'T1', name: 'Jane Doe', email: 'jane@example.com', phone: '555-0199', unit: 'Oakridge #101', rent: 1400 },
      { id: 'T2', name: 'Alice Cooper', email: 'alice@example.com', phone: '555-0188', unit: 'Oakridge #105', rent: 1500 }
    ],
    '2': [
      { id: 'T3', name: 'John Smith', email: 'john@example.com', phone: '555-0144', unit: 'Pacific #4', rent: 1350 }
    ]
  };

  const paymentsByProperty: Record<string, Payment[]> = {
    '1': [
      { id: 'P1', month: 'July 2026', amount: 1400, status: 'Paid' },
      { id: 'P2', month: 'June 2026', amount: 1400, status: 'Paid' }
    ],
    '2': [
      { id: 'P3', month: 'July 2026', amount: 1350, status: 'Paid' },
      { id: 'P4', month: 'June 2026', amount: 1350, status: 'Overdue' }
    ]
  };

  const cashflowByProperty: Record<string, { income: number; expenses: number; net: number }> = {
    '1': { income: 15400, expenses: 2200, net: 13200 },
    '2': { income: 11200, expenses: 1650, net: 9550 }
  };

  const maintenanceByProperty: Record<string, MaintenanceRequest[]> = {
    '1': [
      { id: 'M1', issue: 'Leaky faucet in bathroom', status: 'open' }
    ],
    '2': [
      { id: 'M2', issue: 'AC unit blowing warm air', status: 'in_progress' }
    ]
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;

    const newProperty: Property = {
      id: String(Date.now()),
      name,
      address,
      units,
      income,
    };

    setProperties([...properties, newProperty]);
    setName('');
    setAddress('');
    setUnits(1);
    setIncome(1000);
    setIsAddOpen(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim() || !selectedPropertyId) return;

    setProperties(prev => prev.map(p => {
      if (p.id === selectedPropertyId) {
        return { ...p, name, address, units, income };
      }
      return p;
    }));

    setIsEditOpen(false);
  };

  const handleStartEdit = (prop: Property) => {
    setName(prop.name);
    setAddress(prop.address);
    setUnits(prop.units);
    setIncome(prop.income);
    setIsEditOpen(true);
  };

  const handleDeleteProperty = (id: string) => {
    if (confirm('Are you sure you want to delete this property? All associated data will be deleted.')) {
      setProperties(prev => prev.filter(p => p.id !== id));
      setSelectedPropertyId(null);
    }
  };

  const currentProperty = properties.find(p => p.id === selectedPropertyId);

  return (
    <div className="flex flex-col gap-6">
      {!selectedPropertyId ? (
        <>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
                Properties
              </h1>
              <p className="text-slate-400 text-sm mt-1">Select a property for detailed metrics</p>
            </div>
            <button
              onClick={() => {
                setName('');
                setAddress('');
                setUnits(1);
                setIncome(1000);
                setIsAddOpen(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] hover:shadow-indigo-500/35 transition-all duration-200 text-outfit"
            >
              + Add Property
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {properties.map(p => (
              <div 
                key={p.id} 
                className="glass-card p-6 rounded-2xl flex flex-col justify-between"
              >
                <div onClick={() => setSelectedPropertyId(p.id)} className="cursor-pointer">
                  <h3 className="text-xl font-bold text-white text-outfit">{p.name}</h3>
                  <p className="text-slate-400 text-sm mt-1">{p.address}</p>
                </div>
                <div className="mt-6 flex justify-between items-center">
                  <div className="flex gap-3 text-xs text-slate-300 font-semibold tracking-wide">
                    <span className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">Units: <strong className="text-white">{p.units}</strong></span>
                    <span className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">Rent: <strong className="text-emerald-400">${p.income}</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStartEdit(p)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/10 transition-all text-outfit"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteProperty(p.id)}
                      className="px-3 py-1.5 rounded-lg border border-rose-500/20 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-all text-outfit"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        currentProperty && (
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <button onClick={() => setSelectedPropertyId(null)} className="text-indigo-400 hover:text-indigo-300 text-sm font-bold transition-all">&larr; Back to Portfolio</button>
              <div className="flex gap-2">
                <button
                  onClick={() => handleStartEdit(currentProperty)}
                  className="px-4 py-2 rounded-xl border border-white/10 text-xs font-bold text-indigo-400 hover:bg-indigo-500/10 transition-all text-outfit"
                >
                  Edit Property
                </button>
                <button
                  onClick={() => handleDeleteProperty(currentProperty.id)}
                  className="px-4 py-2 rounded-xl border border-rose-500/20 text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-all text-outfit"
                >
                  Delete Property
                </button>
              </div>
            </div>
            
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-white text-outfit">{currentProperty.name} Drilldown</h2>
                <p className="text-slate-400 text-sm mt-1">{currentProperty.address}</p>
              </div>
              
              {/* Cashflow Summary Widget */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 flex gap-6 text-sm">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Income</span>
                  <span className="text-emerald-400 font-bold">${cashflowByProperty[currentProperty.id]?.income || currentProperty.income}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Expenses</span>
                  <span className="text-rose-400 font-bold">-${cashflowByProperty[currentProperty.id]?.expenses || 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Net Cash Flow</span>
                  <span className="text-indigo-400 font-bold">${cashflowByProperty[currentProperty.id]?.net || currentProperty.income}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Respective Tenants */}
              <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
                <h4 className="font-bold text-slate-200 text-outfit border-b border-white/5 pb-2">Active Tenants</h4>
                <div className="flex flex-col gap-3">
                  {(tenantsByProperty[currentProperty.id] || []).map(t => (
                    <div key={t.id} className="flex justify-between items-center text-sm">
                      <div>
                        <div className="font-semibold text-white">{t.name}</div>
                        <div className="text-xs text-slate-400">{t.unit}</div>
                      </div>
                      <span className="font-bold text-emerald-400">${t.rent}/mo</span>
                    </div>
                  ))}
                  {(tenantsByProperty[currentProperty.id] || []).length === 0 && (
                    <span className="text-slate-500 text-xs italic">No active tenants mapped</span>
                  )}
                </div>
              </div>

              {/* Payments History */}
              <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
                <h4 className="font-bold text-slate-200 text-outfit border-b border-white/5 pb-2">Rent Payments</h4>
                <div className="flex flex-col gap-3">
                  {(paymentsByProperty[currentProperty.id] || []).map(p => (
                    <div key={p.id} className="flex justify-between items-center text-sm">
                      <span className="text-slate-300 font-medium">{p.month}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-white">${p.amount}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${p.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{p.status}</span>
                      </div>
                    </div>
                  ))}
                  {(paymentsByProperty[currentProperty.id] || []).length === 0 && (
                    <span className="text-slate-500 text-xs italic">No payment history recorded</span>
                  )}
                </div>
              </div>

              {/* Maintenance Requests */}
              <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 md:col-span-2">
                <h4 className="font-bold text-slate-200 text-outfit border-b border-white/5 pb-2">Active Maintenance Requests</h4>
                <div className="flex flex-col gap-3">
                  {(maintenanceByProperty[currentProperty.id] || []).map(m => (
                    <div key={m.id} className="flex justify-between items-center text-sm bg-white/5 p-3 rounded-lg border border-white/5">
                      <span className="text-slate-200 font-semibold">{m.issue}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${m.status === 'open' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>{m.status}</span>
                    </div>
                  ))}
                  {(maintenanceByProperty[currentProperty.id] || []).length === 0 && (
                    <span className="text-slate-500 text-xs italic">No active requests logged</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* Add / Edit Modals */}
      {(isAddOpen || isEditOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-opacity">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 relative flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white text-outfit tracking-tight">
                {isAddOpen ? 'Add New Property' : 'Edit Property Details'}
              </h2>
              <button 
                onClick={() => { setIsAddOpen(false); setIsEditOpen(false); }}
                className="text-slate-400 hover:text-white transition-colors font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={isAddOpen ? handleAddSubmit : handleEditSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Property Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Pinecrest Plaza"
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Address</label>
                <input 
                  type="text" 
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. 789 Pinewood Lane"
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Total Units</label>
                  <input 
                    type="number" 
                    value={units}
                    onChange={e => setUnits(Number(e.target.value))}
                    min={1}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Estimated Rent Roll ($)</label>
                  <input 
                    type="number" 
                    value={income}
                    onChange={e => setIncome(Number(e.target.value))}
                    min={0}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => { setIsAddOpen(false); setIsEditOpen(false); }}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 transition-all text-outfit"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] hover:shadow-indigo-500/35 transition-all duration-200 text-outfit"
                >
                  {isAddOpen ? 'Add Property' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

