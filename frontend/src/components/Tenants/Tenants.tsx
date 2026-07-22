import { memo, useCallback, useMemo, useState } from 'react';
import { useTenants, Tenant, TenantInput } from '../../hooks/useTenants';
import { useUnits } from '../../hooks/useUnits';

const today = () => new Date().toISOString().split('T')[0];
const oneYearFromToday = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
};

interface TenantRowProps {
  tenant: Tenant;
  isSelected: boolean;
  onSelect: (t: Tenant) => void;
  onEdit: (t: Tenant, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

// Memoized so selecting/editing one tenant doesn't re-render every other row.
const TenantRow = memo(({ tenant: t, isSelected, onSelect, onEdit, onDelete }: TenantRowProps) => (
  <tr
    onClick={() => onSelect(t)}
    className={`hover:bg-white/5 transition-all duration-150 align-top cursor-pointer ${
      isSelected ? 'bg-indigo-500/5 border-l-2 border-indigo-500' : ''
    }`}
  >
    <td className="px-6 py-4">
      <div className="font-bold text-white text-outfit text-base">{t.name}</div>
      {t.housing_authority !== 'None' && t.housing_authority !== '' && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 mt-1">
          {t.housing_authority}
        </span>
      )}
    </td>
    <td className="px-6 py-4 text-sm text-slate-300">
      <div className="font-semibold text-slate-200">{t.unit}</div>
      <div className="text-xs text-slate-500 mt-1">{t.email}</div>
      <div className="text-xs text-slate-500">{t.phone}</div>
    </td>
    <td className="px-6 py-4 text-sm max-w-xs">
      {t.delinquency_notes || t.eviction_notes || (t.payment_plan !== 'None' && t.payment_plan !== '') ? (
        <div className="flex flex-col gap-2">
          {t.delinquency_notes && (
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Delinquency Notes</span>
              <span className="text-xs text-amber-400 font-medium line-clamp-1">{t.delinquency_notes}</span>
            </div>
          )}
          {t.eviction_notes && (
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Eviction Notes</span>
              <span className="text-xs text-rose-400 font-medium line-clamp-1">{t.eviction_notes}</span>
            </div>
          )}
          {t.payment_plan !== 'None' && t.payment_plan !== '' && (
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Payment Plan</span>
              <span className="text-xs text-indigo-400 font-semibold line-clamp-1">{t.payment_plan}</span>
            </div>
          )}
        </div>
      ) : (
        <span className="text-slate-500 text-xs italic">No active notes or arrangements</span>
      )}
    </td>
    <td className="px-6 py-4">
      <div className="text-lg font-extrabold text-emerald-400 text-outfit">${t.rent}/mo</div>
      <div className="text-[10px] text-slate-500 font-bold uppercase block mt-1">Status: Active</div>
      {t.documents && t.documents.length > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider mt-1">
          📎 {t.documents.length} Docs
        </span>
      )}
    </td>
    <td className="px-6 py-4 text-right">
      <div className="flex gap-2 justify-end">
        <button
          onClick={(e) => onEdit(t, e)}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/10 transition-all text-outfit"
        >
          Edit
        </button>
        <button
          onClick={(e) => onDelete(t.id, e)}
          className="px-3 py-1.5 rounded-lg border border-rose-500/25 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-all text-outfit"
        >
          Delete
        </button>
      </div>
    </td>
  </tr>
));

export const Tenants = () => {
  const { tenants, createTenant, updateTenant, deleteTenant } = useTenants();
  const { units } = useUnits();

  // Selected Tenant for Sidebar Details
  const [selectedTenantDetails, setSelectedTenantDetails] = useState<Tenant | null>(null);

  // Dynamic Notes State
  const [tenantNotes, setTenantNotes] = useState<Record<string, string[]>>({
    '1': [
      'Initial lease signed with guarantor.',
      'Approved for housing assistance voucher on 2026-03-01.',
      'Inbound email request received for payment arrangement details.'
    ],
    '2': [
      'Rent paid consistently via ACH auto-pay.',
      'Lease renewal offer sent on 2026-06-15.'
    ]
  });

  const [newNote, setNewNote] = useState('');

  // Form states for Add/Edit Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [rent, setRent] = useState(1000);
  const [dueDay, setDueDay] = useState(1);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(oneYearFromToday());
  const [delinquencyNotes, setDelinquencyNotes] = useState('');
  const [evictionNotes, setEvictionNotes] = useState('');
  const [housingAuthority, setHousingAuthority] = useState('None');
  const [paymentPlan, setPaymentPlan] = useState('None');
  const [documents, setDocuments] = useState<string[]>([]);

  const properties = useMemo(() => {
    const seen = new Map<string, string>();
    units.forEach(u => seen.set(u.property_id, u.property_name));
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [units]);

  // Vacant units, plus whichever unit the tenant being edited already occupies.
  const selectableUnits = useMemo(
    () => units.filter(u => u.property_id === propertyId && (!u.tenant_id || u.id === editingUnitId)),
    [units, propertyId, editingUnitId]
  );

  const buildInput = (): TenantInput => ({
    name, email, phone, unit_id: unitId, rent, due_day: dueDay,
    start_date: startDate, end_date: endDate,
    delinquency_notes: delinquencyNotes,
    eviction_notes: evictionNotes,
    housing_authority: housingAuthority,
    payment_plan: paymentPlan,
    documents,
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !unitId || !startDate || !endDate) return;

    await createTenant(buildInput());
    resetForm();
    setIsAddOpen(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !unitId || !startDate || !endDate || !selectedTenantId) return;

    await updateTenant({ id: selectedTenantId, ...buildInput() });
    if (selectedTenantDetails?.id === selectedTenantId) {
      setSelectedTenantDetails({ ...selectedTenantDetails, ...buildInput(), id: selectedTenantId, unit_id: unitId, property_id: propertyId });
    }

    setIsEditOpen(false);
    resetForm();
  };

  const handleStartEdit = useCallback((t: Tenant, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid selecting tenant row
    setSelectedTenantId(t.id);
    setName(t.name);
    setEmail(t.email);
    setPhone(t.phone);
    setPropertyId(t.property_id || '');
    setUnitId(t.unit_id || '');
    setEditingUnitId(t.unit_id || null);
    setRent(t.rent);
    setDueDay(t.due_day || 1);
    setStartDate(t.start_date || today());
    setEndDate(t.end_date || oneYearFromToday());
    setDelinquencyNotes(t.delinquency_notes);
    setEvictionNotes(t.eviction_notes);
    setHousingAuthority(t.housing_authority);
    setPaymentPlan(t.payment_plan);
    setDocuments(t.documents || []);
    setIsEditOpen(true);
  }, []);

  const handleDeleteTenant = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid selecting tenant row
    if (!confirm('Are you sure you want to remove this tenant record?')) return;
    try {
      await deleteTenant(id);
      setSelectedTenantDetails(prev => (prev?.id === id ? null : prev));
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(message || 'Failed to delete tenant.');
    }
  }, [deleteTenant]);

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !selectedTenantDetails) return;

    const tid = selectedTenantDetails.id;
    setTenantNotes(prev => ({
      ...prev,
      [tid]: [...(prev[tid] || []), newNote.trim()]
    }));
    setNewNote('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArr = Array.from(e.target.files).map(file => file.name);
      setDocuments(prev => [...prev, ...filesArr]);
    }
  };

  const handleRemoveDoc = (index: number) => {
    setDocuments(prev => prev.filter((_, idx) => idx !== index));
  };

  const resetForm = () => {
    setSelectedTenantId(null);
    setName('');
    setEmail('');
    setPhone('');
    setPropertyId('');
    setUnitId('');
    setEditingUnitId(null);
    setRent(1000);
    setDueDay(1);
    setStartDate(today());
    setEndDate(oneYearFromToday());
    setDelinquencyNotes('');
    setEvictionNotes('');
    setHousingAuthority('None');
    setPaymentPlan('None');
    setDocuments([]);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            Tenant Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage tenant communications, payment arrangements, and active status notes</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsAddOpen(true);
          }}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] hover:shadow-indigo-500/35 transition-all duration-200 text-outfit"
        >
          + Add Tenant
        </button>
      </div>

      {/* Split Pane Container */}
      <div className="flex gap-6 items-start flex-col lg:flex-row w-full">
        {/* Table List View */}
        <div className={`overflow-hidden glass-panel rounded-2xl w-full transition-all duration-300 ${selectedTenantDetails ? 'lg:w-[65%]' : 'w-full'}`}>
          <table className="min-w-full divide-y divide-white/5 text-left border-collapse">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Tenant Info</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Contact & Unit</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Custom Fields & Notes</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit">Rent Details</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-outfit text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent">
              {tenants.map(t => (
                <TenantRow
                  key={t.id}
                  tenant={t}
                  isSelected={selectedTenantDetails?.id === t.id}
                  onSelect={setSelectedTenantDetails}
                  onEdit={handleStartEdit}
                  onDelete={handleDeleteTenant}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Sidebar History Drawer panel */}
        {selectedTenantDetails && (
          <div className="glass-panel w-full lg:w-[35%] rounded-2xl p-6 flex flex-col gap-6 relative animate-fadeIn">
            {/* Drawer Header */}
            <div className="flex justify-between items-start border-b border-white/5 pb-4">
              <div>
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">Tenant Timeline File</span>
                <h2 className="text-xl font-bold text-white text-outfit">{selectedTenantDetails.name}</h2>
                <span className="text-xs text-slate-400">{selectedTenantDetails.unit}</span>
              </div>
              <button 
                onClick={() => setSelectedTenantDetails(null)}
                className="text-slate-400 hover:text-white transition-colors font-bold text-lg"
              >
                &times;
              </button>
            </div>

            {/* General History Detail Section */}
            <div className="flex flex-col gap-4 text-sm border-b border-white/5 pb-4">
              <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Lease Statement</h4>
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/40 p-3 rounded-xl border border-white/5">
                <div>
                  <span className="text-slate-500 block">Lease Rent</span>
                  <strong className="text-white text-sm text-outfit">${selectedTenantDetails.rent}/mo</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Lease Term</span>
                  <strong className="text-white text-sm text-outfit">
                    {selectedTenantDetails.start_date && selectedTenantDetails.end_date
                      ? `${selectedTenantDetails.start_date} – ${selectedTenantDetails.end_date}`
                      : '—'}
                  </strong>
                </div>
                <div className="col-span-2 border-t border-white/5 pt-2 mt-1">
                  <span className="text-slate-500 block">Rental Assistance (Voucher)</span>
                  <strong className="text-indigo-300">{selectedTenantDetails.housing_authority}</strong>
                </div>
              </div>

              {selectedTenantDetails.payment_plan !== 'None' && selectedTenantDetails.payment_plan !== '' && (
                <div className="bg-indigo-950/10 border border-indigo-500/20 p-3 rounded-xl">
                  <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">Active Payment Plan Arrangement</span>
                  <span className="text-xs text-indigo-200">{selectedTenantDetails.payment_plan}</span>
                </div>
              )}
            </div>

            {/* Attached Documents Section */}
            <div className="flex flex-col gap-3 border-b border-white/5 pb-4">
              <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Lease & Documents</h4>
              <div className="flex flex-col gap-2">
                {selectedTenantDetails.documents && selectedTenantDetails.documents.map((doc, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-slate-300">
                    <span className="truncate pr-2">📎 {doc}</span>
                    <a 
                      href="#" 
                      onClick={(e) => { e.preventDefault(); alert(`Downloading simulated file: ${doc}`); }}
                      className="text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      Download
                    </a>
                  </div>
                ))}
                {(!selectedTenantDetails.documents || selectedTenantDetails.documents.length === 0) && (
                  <span className="text-slate-500 text-xs italic">No documents attached</span>
                )}
              </div>
            </div>

            {/* Dynamic Notes Section */}
            <div className="flex flex-col gap-3 flex-1">
              <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">CRM Event Notes Log</h4>
              <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                {(tenantNotes[selectedTenantDetails.id] || []).map((note, index) => (
                  <div key={index} className="text-xs bg-white/5 border border-white/5 rounded-xl p-3 text-slate-300">
                    {note}
                  </div>
                ))}
                {(tenantNotes[selectedTenantDetails.id] || []).length === 0 && (
                  <span className="text-slate-500 text-xs italic p-1">No notes recorded for this tenant yet.</span>
                )}
              </div>

              {/* Add Note Form */}
              <form onSubmit={handleAddNote} className="flex gap-2 items-end mt-2">
                <textarea 
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Type new tenant arrangement notes..."
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

      {/* Add / Edit Dialogs */}
      {(isAddOpen || isEditOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-opacity">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 relative flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white text-outfit tracking-tight">
                {isAddOpen ? 'Add New Tenant' : 'Edit Tenant Record'}
              </h2>
              <button 
                onClick={() => { setIsAddOpen(false); setIsEditOpen(false); resetForm(); }}
                className="text-slate-400 hover:text-white transition-colors font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={isAddOpen ? handleAddSubmit : handleEditSubmit} className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Full Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Email Address</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Phone Number</label>
                  <input 
                    type="text" 
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="555-0100"
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Property</label>
                  <select
                    value={propertyId}
                    onChange={e => { setPropertyId(e.target.value); setUnitId(''); }}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  >
                    <option value="">Select property…</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Unit</label>
                  <select
                    value={unitId}
                    onChange={e => setUnitId(e.target.value)}
                    disabled={!propertyId}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-40"
                    required
                  >
                    <option value="">{propertyId ? 'Select unit…' : 'Pick a property first'}</option>
                    {selectableUnits.map(u => <option key={u.id} value={u.id}>#{u.unit_number}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Monthly Rent Amount ($)</label>
                  <input
                    type="number"
                    value={rent}
                    onChange={e => setRent(Number(e.target.value))}
                    min={0}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Rent Due Day</label>
                  <input
                    type="number"
                    value={dueDay}
                    onChange={e => setDueDay(Number(e.target.value))}
                    min={1}
                    max={31}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Lease Start</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Lease End</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Housing Authority / Assistance</label>
                <input 
                  type="text" 
                  value={housingAuthority}
                  onChange={e => setHousingAuthority(e.target.value)}
                  placeholder="e.g. Fulton County HA or None"
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Payment Plan Arrangements</label>
                <input 
                  type="text" 
                  value={paymentPlan}
                  onChange={e => setPaymentPlan(e.target.value)}
                  placeholder="e.g. $1000 on 10/11, $966 on 10/25"
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors"
                />
              </div>

              {/* Document upload field */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Lease Agreement & Other Docs</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="file" 
                    multiple
                    onChange={handleFileUpload}
                    id="tenant-docs-upload"
                    className="hidden"
                  />
                  <label 
                    htmlFor="tenant-docs-upload"
                    className="px-4 py-2 border border-dashed border-white/20 hover:border-indigo-500/50 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer transition-colors"
                  >
                    Select Files...
                  </label>
                </div>

                {documents.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {documents.map((doc, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-xs text-slate-300">
                        <span className="max-w-[120px] truncate">{doc}</span>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveDoc(idx)}
                          className="text-rose-400 hover:text-rose-300 font-bold"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Delinquency Notes</label>
                <textarea 
                  value={delinquencyNotes}
                  onChange={e => setDelinquencyNotes(e.target.value)}
                  placeholder="Optional arrears context..."
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors min-h-[60px]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Eviction Notes</label>
                <textarea 
                  value={evictionNotes}
                  onChange={e => setEvictionNotes(e.target.value)}
                  placeholder="Optional legal warning status..."
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors min-h-[60px]"
                />
              </div>

              <div className="flex gap-3 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => { setIsAddOpen(false); setIsEditOpen(false); resetForm(); }}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 transition-all text-outfit"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] hover:shadow-indigo-500/35 transition-all duration-200 text-outfit"
                >
                  {isAddOpen ? 'Add Tenant' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
