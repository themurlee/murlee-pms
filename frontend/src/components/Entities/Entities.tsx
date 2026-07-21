import { useState } from 'react';
import { useEntities, Entity } from '../../hooks/useEntities';

const EMPTY = { name: '', entity_type: 'LLC', ein: '' };

export const Entities = () => {
  const { entities, createEntity, updateEntity, deleteEntity } = useEntities();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const openAdd = () => { setEditingId(null); setForm(EMPTY); setIsOpen(true); };
  const openEdit = (e: Entity) => { setEditingId(e.id); setForm({ name: e.name, entity_type: e.entity_type, ein: e.ein }); setIsOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) await updateEntity({ id: editingId, ...form });
    else await createEntity(form);
    setIsOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this entity? Properties keep existing but lose their entity grouping.')) {
      await deleteEntity(id);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            Entities
          </h1>
          <p className="text-slate-400 text-sm mt-1">Group properties under an LLC or ownership vehicle for per-entity bookkeeping &amp; tax</p>
        </div>
        <button onClick={openAdd}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all text-outfit">
          + Add Entity
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {entities.map(e => (
          <div key={e.id} className="glass-card p-6 rounded-2xl flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white text-outfit">{e.name}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{e.entity_type}</span>
              </div>
              {e.ein && <p className="text-slate-400 text-xs mt-1">EIN: {e.ein}</p>}
            </div>
            <div className="flex justify-between items-center">
              <span className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 text-xs text-slate-300 font-semibold">
                Properties: <strong className="text-white">{e.property_count}</strong>
              </span>
              <div className="flex gap-2">
                <button onClick={() => openEdit(e)} className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/10 text-outfit">Edit</button>
                <button onClick={() => handleDelete(e.id)} className="px-3 py-1.5 rounded-lg border border-rose-500/20 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 text-outfit">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {entities.length === 0 && (
          <div className="glass-card p-10 rounded-2xl text-center text-slate-500 text-sm md:col-span-2">
            No entities yet. Add an LLC to group your properties for bookkeeping and tax reports.
          </div>
        )}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white text-outfit">{editingId ? 'Edit Entity' : 'Add Entity'}</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Entity Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                  placeholder="e.g. Jayam Realty LLC"
                  className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Type</label>
                  <select value={form.entity_type} onChange={e => setForm({ ...form, entity_type: e.target.value })}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="LLC">LLC</option>
                    <option value="S-Corp">S-Corp</option>
                    <option value="Sole Proprietor">Sole Proprietor</option>
                    <option value="Partnership">Partnership</option>
                    <option value="Individual">Individual</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">EIN (optional)</label>
                  <input value={form.ein} onChange={e => setForm({ ...form, ein: e.target.value })}
                    placeholder="88-1234567"
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600" />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-semibold text-sm hover:bg-white/5 text-outfit">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all text-outfit">
                  {editingId ? 'Save Changes' : 'Add Entity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
