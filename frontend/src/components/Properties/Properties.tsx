import { useState } from 'react';
import { useProperties, Property, UnitInput } from '../../hooks/useProperties';
import { useEntities } from '../../hooks/useEntities';
import { Entities } from '../Entities/Entities';

const PROPERTY_TYPES = ['Single-Family', 'Multi-Family', 'Condo', 'Townhouse', 'Apartment', 'Commercial'];
const emptyAddr = { street: '', city: '', state: '', zip: '' };
const blankUnit = (): UnitInput => ({ unit_number: '', beds: undefined, baths: undefined, sq_ft: undefined, market_rent: undefined });

interface PropertiesProps {
  userRole?: 'landlord' | 'tenant';
}

export const Properties = ({ userRole = 'landlord' }: PropertiesProps) => {
  const [view, setView] = useState<'properties' | 'entities'>('properties');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const { properties, createProperty, updateProperty, deleteProperty } = useProperties();
  const { entities } = useEntities();

  // Form modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [addr, setAddr] = useState({ ...emptyAddr });
  const [propertyType, setPropertyType] = useState('Single-Family');
  const [entityId, setEntityId] = useState('');
  const [income, setIncome] = useState(1000);
  const [unitRows, setUnitRows] = useState<UnitInput[]>([blankUnit()]);

  const setAddrField = (k: keyof typeof emptyAddr, v: string) => setAddr(prev => ({ ...prev, [k]: v }));
  const updateUnitRow = (i: number, patch: Partial<UnitInput>) =>
    setUnitRows(prev => prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  const addUnitRow = () => setUnitRows(prev => [...prev, blankUnit()]);
  const removeUnitRow = (i: number) => setUnitRows(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

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

  const resetForm = () => {
    setName('');
    setAddr({ ...emptyAddr });
    setPropertyType('Single-Family');
    setEntityId('');
    setIncome(1000);
    setUnitRows([blankUnit()]);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !addr.street.trim()) return;

    const unit_list = unitRows
      .filter(u => (u.unit_number || '').trim())
      .map((u, i) => ({
        unit_number: u.unit_number || `Unit ${i + 1}`,
        beds: u.beds ? Number(u.beds) : undefined,
        baths: u.baths ? Number(u.baths) : undefined,
        sq_ft: u.sq_ft ? Number(u.sq_ft) : undefined,
        market_rent: u.market_rent ? Number(u.market_rent) : 0,
      }));

    await createProperty({
      name, address: addr, property_type: propertyType, entity_id: entityId || null,
      unit_list: unit_list.length ? unit_list : undefined,
      units: unit_list.length || 1,
    });
    resetForm();
    setIsAddOpen(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !addr.street.trim() || !selectedPropertyId) return;

    await updateProperty({
      id: selectedPropertyId, name, address: addr,
      property_type: propertyType, entity_id: entityId || null, income,
    });
    setIsEditOpen(false);
  };

  const handleStartEdit = (prop: Property) => {
    setName(prop.name);
    setAddr({ ...emptyAddr, ...(prop.address_parts || { street: prop.address }) });
    setPropertyType(prop.property_type || 'Single-Family');
    setEntityId(prop.entity_id || '');
    setIncome(prop.income);
    setIsEditOpen(true);
  };

  const handleDeleteProperty = async (id: string) => {
    if (confirm('Are you sure you want to delete this property? All associated data will be deleted.')) {
      await deleteProperty(id);
      setSelectedPropertyId(null);
    }
  };

  const currentProperty = properties.find(p => p.id === selectedPropertyId);

  return (
    <div className="flex flex-col gap-6">
      {userRole === 'landlord' && (
        <div className="flex gap-2 bg-slate-900/50 p-1.5 rounded-xl border border-white/5 w-fit">
          <button
            onClick={() => setView('properties')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all text-outfit ${
              view === 'properties' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setView('entities')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all text-outfit ${
              view === 'entities' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Entities
          </button>
        </div>
      )}

      {view === 'entities' && <Entities />}

      {view === 'properties' && (
      <>
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
              onClick={() => { resetForm(); setIsAddOpen(true); }}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-bold text-white text-outfit">{p.name}</h3>
                    {p.property_type && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{p.property_type}</span>}
                  </div>
                  <p className="text-slate-400 text-sm mt-1">{p.address}</p>
                  {p.entity_name && <p className="text-[11px] text-slate-500 mt-0.5">🏛 {p.entity_name}</p>}
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
      {(isAddOpen || isEditOpen) && (() => {
        const fieldCls = 'bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors';
        const labelCls = 'text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit';
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-opacity overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 relative flex flex-col gap-5 my-8">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Property Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pinecrest Plaza" className={fieldCls} required />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Property Type</label>
                  <select value={propertyType} onChange={e => setPropertyType(e.target.value)} className={fieldCls}>
                    {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className={labelCls}>Owning Entity</label>
                <select value={entityId} onChange={e => setEntityId(e.target.value)} className={fieldCls}>
                  <option value="">— No entity —</option>
                  {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
                </select>
              </div>

              {/* Structured address */}
              <div className="flex flex-col gap-3 border-t border-white/5 pt-4">
                <span className={labelCls}>Address</span>
                <input type="text" value={addr.street} onChange={e => setAddrField('street', e.target.value)} placeholder="Street address" className={fieldCls} required />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <input type="text" value={addr.city} onChange={e => setAddrField('city', e.target.value)} placeholder="City" className={fieldCls} />
                  <input type="text" value={addr.state} onChange={e => setAddrField('state', e.target.value)} placeholder="State" className={fieldCls} />
                  <input type="text" value={addr.zip} onChange={e => setAddrField('zip', e.target.value)} placeholder="ZIP" className={`${fieldCls} col-span-2 sm:col-span-1`} />
                </div>
              </div>

              {/* Units editor (add only) or rent roll (edit) */}
              {isAddOpen ? (
                <div className="flex flex-col gap-3 border-t border-white/5 pt-4">
                  <div className="flex justify-between items-center">
                    <span className={labelCls}>Units</span>
                    <button type="button" onClick={addUnitRow} className="text-xs font-bold text-indigo-400 hover:text-indigo-300">+ Add Unit</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] text-slate-500 font-bold uppercase px-1">
                      <span className="col-span-3">Unit #</span><span className="col-span-2">Beds</span><span className="col-span-2">Baths</span><span className="col-span-2">Sq Ft</span><span className="col-span-2">Rent $</span><span className="col-span-1"></span>
                    </div>
                    {unitRows.map((u, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <input value={u.unit_number} onChange={e => updateUnitRow(i, { unit_number: e.target.value })} placeholder={`Unit ${i + 1}`} className={`${fieldCls} col-span-12 sm:col-span-3 !py-2`} />
                        <input type="number" min={0} value={u.beds ?? ''} onChange={e => updateUnitRow(i, { beds: e.target.value ? Number(e.target.value) : undefined })} placeholder="Beds" className={`${fieldCls} col-span-3 sm:col-span-2 !py-2`} />
                        <input type="number" min={0} step="0.5" value={u.baths ?? ''} onChange={e => updateUnitRow(i, { baths: e.target.value ? Number(e.target.value) : undefined })} placeholder="Baths" className={`${fieldCls} col-span-3 sm:col-span-2 !py-2`} />
                        <input type="number" min={0} value={u.sq_ft ?? ''} onChange={e => updateUnitRow(i, { sq_ft: e.target.value ? Number(e.target.value) : undefined })} placeholder="Sq ft" className={`${fieldCls} col-span-3 sm:col-span-2 !py-2`} />
                        <input type="number" min={0} value={u.market_rent ?? ''} onChange={e => updateUnitRow(i, { market_rent: e.target.value ? Number(e.target.value) : undefined })} placeholder="Rent" className={`${fieldCls} col-span-2 sm:col-span-2 !py-2`} />
                        <button type="button" onClick={() => removeUnitRow(i)} className="col-span-1 text-slate-500 hover:text-rose-400 font-bold text-lg" title="Remove unit">&times;</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
                  <label className={labelCls}>Estimated Rent Roll ($)</label>
                  <input type="number" value={income} onChange={e => setIncome(Number(e.target.value))} min={0} className={fieldCls} />
                  <span className="text-[11px] text-slate-500">Edit individual units from the property drilldown (coming next). This adjusts the property-level estimate.</span>
                </div>
              )}

              <div className="flex gap-3 justify-end mt-2">
                <button type="button" onClick={() => { setIsAddOpen(false); setIsEditOpen(false); }} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 transition-all text-outfit">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] hover:shadow-indigo-500/35 transition-all duration-200 text-outfit">
                  {isAddOpen ? 'Add Property' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}
      </>
      )}
    </div>
  );
};

