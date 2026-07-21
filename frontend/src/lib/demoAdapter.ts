/**
 * Demo mode — a self-contained in-memory backend for the hosted (GitHub Pages)
 * build, where no real API exists. When the app runs on *.github.io, the axios
 * instance uses `demoAdapter` instead of making network calls, so every tab shows
 * seeded data and create/edit/delete work for the session (state resets on reload).
 *
 * Local dev (localhost) is unaffected — it keeps hitting the real backend on :5001.
 */

// Active only on the static host. Never true in local dev.
export const isDemo =
  typeof window !== 'undefined' && /(^|\.)github\.io$/i.test(window.location.hostname);

const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().split('T')[0];

// ---- seeded in-memory store --------------------------------------------------
let entities: any[] = [
  { id: 'e1', name: 'Jayam Realty LLC', entity_type: 'LLC', ein: '88-1234567', property_count: 2 },
];

let properties: any[] = [
  { id: 'p1', name: 'Oakridge Manor', units: 2, income: 2900, address: '128 Oakridge Dr, Atlanta, GA 30301',
    address_parts: { street: '128 Oakridge Dr', city: 'Atlanta', state: 'GA', zip: '30301' },
    property_type: 'Multi-Family', entity_id: 'e1', entity_name: 'Jayam Realty LLC' },
  { id: 'p2', name: 'Pacific Breeze', units: 2, income: 2950, address: '44 Pacific Ave, Atlanta, GA 30305',
    address_parts: { street: '44 Pacific Ave', city: 'Atlanta', state: 'GA', zip: '30305' },
    property_type: 'Multi-Family', entity_id: 'e1', entity_name: 'Jayam Realty LLC' },
];

let units: any[] = [
  { id: 'u1', unit_number: '101', beds: 2, baths: 1, sq_ft: 900, market_rent: 1400, property_id: 'p1', property_name: 'Oakridge Manor', tenant_id: 't1', tenant_name: 'Jane Doe', tenant_email: 'jane@example.com', rent: 1400, lease_start: '2026-01-01', lease_end: '2026-12-31', balance_due: 1400 },
  { id: 'u2', unit_number: '102', beds: 2, baths: 1, sq_ft: 950, market_rent: 1500, property_id: 'p1', property_name: 'Oakridge Manor', tenant_id: 't3', tenant_name: 'Alice Cooper', tenant_email: 'alice@example.com', rent: 1500, lease_start: '2026-03-01', lease_end: '2027-02-28', balance_due: 0 },
  { id: 'u3', unit_number: '4', beds: 1, baths: 1, sq_ft: 700, market_rent: 1350, property_id: 'p2', property_name: 'Pacific Breeze', tenant_id: 't2', tenant_name: 'John Smith', tenant_email: 'john@example.com', rent: 1350, lease_start: '2025-02-15', lease_end: '2027-02-14', balance_due: 0 },
  { id: 'u4', unit_number: '12', beds: 2, baths: 2, sq_ft: 1100, market_rent: 1600, property_id: 'p2', property_name: 'Pacific Breeze', tenant_id: 't4', tenant_name: 'Bob Marley', tenant_email: 'bob@example.com', rent: 1600, lease_start: '2026-02-01', lease_end: '2027-01-31', balance_due: 400 },
];

let tenants: any[] = [
  { id: 't1', name: 'Jane Doe', email: 'jane@example.com', phone: '555-0199', lease_id: 'L-101', unit_id: 'u1', property_id: 'p1', unit: 'Oakridge #101', rent: 1400, due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31', delinquency_notes: '34 days late on July rent', eviction_notes: '', housing_authority: 'Fulton County HA', payment_plan: 'None', documents: ['lease-jane-doe.pdf'] },
  { id: 't2', name: 'John Smith', email: 'john@example.com', phone: '555-0144', lease_id: 'L-102', unit_id: 'u3', property_id: 'p2', unit: 'Pacific #4', rent: 1350, due_day: 1, start_date: '2025-02-15', end_date: '2027-02-14', delinquency_notes: '', eviction_notes: '', housing_authority: 'None', payment_plan: 'None', documents: [] },
  { id: 't3', name: 'Alice Cooper', email: 'alice@example.com', phone: '', lease_id: 'L-103', unit_id: 'u2', property_id: 'p1', unit: 'Oakridge #102', rent: 1500, due_day: 1, start_date: '2026-03-01', end_date: '2027-02-28', delinquency_notes: '', eviction_notes: '', housing_authority: 'None', payment_plan: 'None', documents: [] },
  { id: 't4', name: 'Bob Marley', email: 'bob@example.com', phone: '', lease_id: 'L-104', unit_id: 'u4', property_id: 'p2', unit: 'Pacific #12', rent: 1600, due_day: 1, start_date: '2026-02-01', end_date: '2027-01-31', delinquency_notes: 'Missed payment-plan installment', eviction_notes: '', housing_authority: 'None', payment_plan: '$800 on 7/25', documents: [] },
];

const INVOICE_LEASE_CONTEXT: Record<string, { property: string; tenant: string; unit: string; start: string; end: string }> = {
  'L-101': { property: 'Oakridge Manor', tenant: 'Jane Doe', unit: '101', start: '2026-01-01', end: '2026-12-31' },
  'L-102': { property: 'Pacific Breeze', tenant: 'John Smith', unit: '4', start: '2025-02-15', end: '2027-02-14' },
  'L-103': { property: 'Oakridge Manor', tenant: 'Alice Cooper', unit: '102', start: '2026-03-01', end: '2027-02-28' },
};

const inv = (id: string, lease: string, due: string, amount: number, lateFee: number, status: string, method: string): any => {
  const ctx = INVOICE_LEASE_CONTEXT[lease];
  const itemsTotal = 0;
  return {
    id, lease_id: lease, due_date: due, amount_due: amount, late_fee: lateFee, status,
    transfer_id: `tx_${id}`, created_at: nowIso(), paid_at: status === 'paid' ? nowIso() : null,
    property_nickname: ctx?.property, tenant_name: ctx?.tenant, unit_number: ctx?.unit,
    lease_start: ctx?.start, lease_end: ctx?.end, lease_status: 'active',
    actions: { can_mark_as_paid: status !== 'paid', can_edit: status !== 'paid', can_delete: status !== 'paid' },
    active_view: 'payment_timeline',
    timeline: [{ timestamp: nowIso(), event: 'Invoice created', description: 'Monthly rent invoice generated from lease terms.' }],
    items: [] as { id: string; description: string; amount: number }[],
    breakdown: { base_rent: amount - lateFee, late_fee: lateFee, items_total: itemsTotal, total_due: amount + itemsTotal, payment_method: method },
  };
};
let invoices: any[] = [
  inv('INV-001', 'L-101', '2026-07-01', 1400, 0, 'overdue', 'Check'),
  inv('INV-002', 'L-102', '2026-07-01', 1350, 0, 'paid', 'ACH'),
  inv('INV-003', 'L-103', '2026-07-01', 1500, 0, 'unpaid', 'Zelle'),
];

let transactions: any[] = [
  { id: 'X1', transaction_date: '2026-07-02', description: 'Rent payment received', amount: 1350, category: 'Rent Received', account_class: 'real_estate', source: 'manual', payment_method: 'ACH', property_id: 'p2', entity_id: 'e1', invoice_id: 'INV-002', reviewed: true, memo: '' },
  { id: 'X2', transaction_date: '2026-07-08', description: 'Home Depot supplies', amount: -85, category: 'Supplies', account_class: 'real_estate', source: 'manual', payment_method: '', property_id: 'p1', entity_id: 'e1', invoice_id: null, reviewed: false, memo: 'Review tax allocation' },
  { id: 'X3', transaction_date: '2026-07-05', description: 'Plumbing repair', amount: -350, category: 'Repairs', account_class: 'real_estate', source: 'manual', payment_method: '', property_id: 'p2', entity_id: 'e1', invoice_id: null, reviewed: true, memo: '' },
  { id: 'X4', transaction_date: '2026-07-04', description: 'ONELIFE VICKERY SPORTS', amount: -200, category: 'Health & Wellness', account_class: 'personal', source: 'manual', payment_method: '', property_id: null, entity_id: null, invoice_id: null, reviewed: false, memo: '' },
];

let maintenance: any[] = [
  { id: 'M1', tenant: 'Alice Cooper', issue: 'No hot water', status: 'open', channel: 'email', priority: 'emergency', category: 'plumbing', reported_at: today(), property_name: 'Oakridge Manor', unit_number: '102' },
  { id: 'M2', tenant: 'Jane Doe', issue: 'Leaky faucet in bathroom', status: 'in_progress', channel: 'portal', priority: 'medium', category: 'plumbing', reported_at: '2026-07-12', property_name: 'Oakridge Manor', unit_number: '101' },
  { id: 'M3', tenant: 'John Smith', issue: 'AC blowing warm air', status: 'open', channel: 'manual', priority: 'high', category: 'hvac', reported_at: '2026-07-18', property_name: 'Pacific Breeze', unit_number: '4' },
];

let notices: any[] = [
  { id: 'N1', type: 'late_notice', channel: 'email', to_email: 'jane@example.com', subject: 'Rent past due — July', status: 'sent', created_at: '2026-07-10T14:00:00Z', tenant_name: 'Jane Doe' },
  { id: 'N2', type: 'payment_confirmation', channel: 'email', to_email: 'john@example.com', subject: 'Payment received — thank you', status: 'sent', created_at: '2026-07-02T09:00:00Z', tenant_name: 'John Smith' },
  { id: 'N3', type: 'rent_reminder', channel: 'email', to_email: 'alice@example.com', subject: 'Rent due in 3 days', status: 'sent', created_at: '2026-06-28T09:00:00Z', tenant_name: 'Alice Cooper' },
];

let messageThreads: any[] = [
  { id: 'TH1', tenant_id: 't1', tenant_name: 'Jane Doe', subject: 'Leak in bathroom', last_message_preview: "Hi, there's a leak in the bathroom. Can you send someone?", last_message_at: '2026-07-20T09:00:00Z', unread: true },
  { id: 'TH2', tenant_id: 't2', tenant_name: 'John Smith', subject: 'Lease renewal', last_message_preview: 'Just checking on the renewal timeline.', last_message_at: '2026-07-18T15:00:00Z', unread: false },
];
let threadMessages: Record<string, any[]> = {
  TH1: [
    { id: 'M1', thread_id: 'TH1', direction: 'inbound', body: "Hi, there's a leak in the bathroom. Can you send someone?", created_at: '2026-07-20T09:00:00Z' },
  ],
  TH2: [
    { id: 'M2', thread_id: 'TH2', direction: 'outbound', body: 'Hi John, just a heads up your lease renews in 6 weeks.', created_at: '2026-07-18T14:00:00Z' },
    { id: 'M3', thread_id: 'TH2', direction: 'inbound', body: 'Just checking on the renewal timeline.', created_at: '2026-07-18T15:00:00Z' },
  ],
};

let billingSettings: any = { late_fee_amount: 50, late_fee_grace_days: 5, reminder_days_before: 3, late_fee_enabled: true, reminders_enabled: true };

const summary = { grossMonthlyIncome: 4250, totalUnits: 4, occupiedUnits: 3, overdueTotal: 2900, openMaintenanceCount: 2, rentCollectionRate: 0.66 };

// ---- adapter -----------------------------------------------------------------
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoAdapter = async (config: any): Promise<any> => {
  const method = (config.method || 'get').toLowerCase();
  const url = (config.url || '').split('?')[0];
  const params = config.params || {};
  let body: any = {};
  try { body = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data || {}); } catch { body = {}; }

  const res = (data: any, status = 200) => ({ data, status, statusText: 'OK', headers: {}, config, request: {} });
  const seg = (prefix: string) => url.slice(prefix.length).split('/')[0];

  await delay(120); // small latency so loading states render

  // AUTH — any non-empty credentials log in as the demo landlord
  if (method === 'post' && url === '/auth/login') {
    return res({ token: 'demo-token', user: { id: 'demo-landlord', email: body.email || 'landlord@murlee.test', name: 'Demo Landlord', role: 'landlord' } });
  }

  // DASHBOARD
  if (method === 'get' && url === '/dashboard/summary') return res(summary);

  // ENTITIES
  if (url === '/entities') {
    if (method === 'get') return res(entities);
    if (method === 'post') { const e = { id: uid(), property_count: 0, ein: '', entity_type: 'LLC', ...body }; entities = [e, ...entities]; return res(e, 201); }
  }
  if (url.startsWith('/entities/')) {
    const id = seg('/entities/');
    if (method === 'put') { entities = entities.map((e) => (e.id === id ? { ...e, ...body } : e)); return res({ message: 'updated' }); }
    if (method === 'delete') { entities = entities.filter((e) => e.id !== id); return res({ message: 'deleted' }); }
  }

  // PROPERTIES
  if (url === '/properties') {
    if (method === 'get') return res(properties);
    if (method === 'post') {
      const ent = entities.find((e) => e.id === body.entity_id);
      const addr = body.address || {};
      const p = { id: uid(), name: body.name, units: body.units || (body.unit_list?.length ?? 1), income: body.income || 0,
        address: [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
        address_parts: addr, property_type: body.property_type, entity_id: body.entity_id || null, entity_name: ent?.name || null };
      properties = [p, ...properties]; return res(p, 201);
    }
  }
  if (url.startsWith('/properties/')) {
    const id = seg('/properties/');
    if (method === 'put') {
      const ent = entities.find((e) => e.id === body.entity_id);
      const addr = body.address || {};
      properties = properties.map((p) => (p.id === id ? { ...p, ...body,
        address: [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ') || p.address,
        address_parts: addr, entity_name: ent?.name || null } : p));
      return res({ message: 'updated' });
    }
    if (method === 'delete') { properties = properties.filter((p) => p.id !== id); return res({ message: 'deleted' }); }
  }

  // UNITS (read-only)
  if (method === 'get' && url === '/units') return res(units);

  // TENANTS
  if (url === '/tenants') {
    if (method === 'get') return res(tenants);
    if (method === 'post') { const t = { id: uid(), documents: [], ...body }; tenants = [t, ...tenants]; return res(t, 201); }
  }
  if (url.startsWith('/tenants/')) {
    const id = seg('/tenants/');
    if (method === 'put') { tenants = tenants.map((t) => (t.id === id ? { ...t, ...body, id } : t)); return res({ message: 'updated' }); }
    if (method === 'delete') { tenants = tenants.filter((t) => t.id !== id); return res({ message: 'deleted' }); }
  }

  // INVOICES
  if (method === 'get' && url === '/invoices') return res(invoices);
  if (method === 'post' && /^\/invoices\/[^/]+\/mark-paid$/.test(url)) {
    const id = url.split('/')[2];
    invoices = invoices.map((i) => (i.id === id
      ? { ...i, status: 'paid', paid_at: nowIso(), actions: { can_mark_as_paid: false, can_edit: false, can_delete: false } }
      : i));
    return res({ message: 'Invoice marked as paid' });
  }
  if (method === 'post' && /^\/invoices\/[^/]+\/items$/.test(url)) {
    const id = url.split('/')[2];
    const item = { id: uid(), description: body.description, amount: Number(body.amount) };
    invoices = invoices.map((i) => {
      if (i.id !== id) return i;
      const items = [...i.items, item];
      const itemsTotal = items.reduce((sum: number, it: { amount: number }) => sum + it.amount, 0);
      return { ...i, items, breakdown: { ...i.breakdown, items_total: itemsTotal, total_due: i.amount_due + i.late_fee + itemsTotal } };
    });
    return res(item, 201);
  }
  if (method === 'delete' && /^\/invoices\/[^/]+\/items\/[^/]+$/.test(url)) {
    const parts = url.split('/');
    const id = parts[2];
    const itemId = parts[4];
    invoices = invoices.map((i) => {
      if (i.id !== id) return i;
      const items = i.items.filter((it: { id: string }) => it.id !== itemId);
      const itemsTotal = items.reduce((sum: number, it: { amount: number }) => sum + it.amount, 0);
      return { ...i, items, breakdown: { ...i.breakdown, items_total: itemsTotal, total_due: i.amount_due + i.late_fee + itemsTotal } };
    });
    return res({ message: 'Invoice item deleted' });
  }
  if (method === 'delete' && /^\/invoices\/[^/]+$/.test(url)) {
    const id = seg('/invoices/'); invoices = invoices.filter((i) => i.id !== id); return res({ message: 'deleted' });
  }

  // TRANSACTIONS
  if (url === '/transactions') {
    if (method === 'get') {
      let rows = transactions;
      if (params.account_class) rows = rows.filter((t) => t.account_class === params.account_class);
      return res(rows);
    }
    if (method === 'post') {
      const t = { id: uid(), reviewed: false, memo: '', source: 'manual', account_class: 'real_estate', payment_method: '', property_id: null, entity_id: null, invoice_id: null, category: null, ...body };
      transactions = [t, ...transactions]; return res(t, 201);
    }
  }
  if (url.startsWith('/transactions/')) {
    const id = seg('/transactions/');
    if (method === 'patch') { transactions = transactions.map((t) => (t.id === id ? { ...t, ...body } : t)); return res({ message: 'updated' }); }
    if (method === 'delete') { transactions = transactions.filter((t) => t.id !== id); return res({ message: 'deleted' }); }
  }

  // MAINTENANCE
  if (url === '/maintenance') {
    if (method === 'get') return res(maintenance);
    if (method === 'post') {
      const t = { id: uid(), tenant: body.tenant || '—', property_name: body.property_name ?? null, unit_number: body.unit_number ?? null,
        issue: body.issue, status: body.status || 'open', channel: body.channel || 'manual', priority: body.priority || 'medium',
        category: body.category || 'general', reported_at: body.reported_at || today() };
      maintenance = [t, ...maintenance]; return res(t, 201);
    }
  }
  if (method === 'post' && url === '/maintenance/inbound') {
    const t = { id: uid(), tenant: body.from_name || 'Tenant', property_name: body.property_hint || null, unit_number: null,
      issue: body.subject || body.body || 'Inbound request', status: 'open', channel: 'email', priority: 'medium', category: 'general', reported_at: today() };
    maintenance = [t, ...maintenance]; return res({ ticketId: t.id, matchedBy: 'email' });
  }
  if (method === 'put' && /^\/maintenance\/[^/]+\/status$/.test(url)) {
    const id = url.split('/')[2];
    maintenance = maintenance.map((t) => (t.id === id ? { ...t, status: body.status } : t));
    return res({ message: 'updated' });
  }

  // NOTICES
  if (url === '/notices') {
    if (method === 'get') return res(notices);
    if (method === 'post') {
      const tenant = tenants.find((t) => t.id === body.tenant_id);
      const n = { id: uid(), type: 'adhoc', channel: 'email', to_email: tenant?.email || '', subject: body.subject, status: 'sent', created_at: nowIso(), tenant_name: tenant?.name || 'Tenant' };
      notices = [n, ...notices]; return res(n, 201);
    }
  }

  // MESSAGE THREADS
  if (url === '/threads') {
    if (method === 'get') {
      const list = params.filter === 'unread' ? messageThreads.filter((t) => t.unread) : messageThreads;
      return res(list);
    }
    if (method === 'post') {
      const tenant = tenants.find((t) => t.id === body.tenant_id);
      const thread = { id: uid(), tenant_id: body.tenant_id, tenant_name: tenant?.name || 'Tenant', subject: body.subject, last_message_preview: String(body.body).slice(0, 280), last_message_at: nowIso(), unread: false };
      messageThreads = [thread, ...messageThreads];
      threadMessages[thread.id] = [{ id: uid(), thread_id: thread.id, direction: 'outbound', body: body.body, created_at: nowIso() }];
      return res(thread, 201);
    }
  }
  if (/^\/threads\/[^/]+\/messages$/.test(url)) {
    const id = url.split('/')[2];
    if (method === 'get') return res(threadMessages[id] || []);
    if (method === 'post') {
      const message = { id: uid(), thread_id: id, direction: 'outbound', body: body.body, created_at: nowIso() };
      threadMessages[id] = [...(threadMessages[id] || []), message];
      messageThreads = messageThreads.map((t) => (t.id === id ? { ...t, last_message_preview: String(body.body).slice(0, 280), last_message_at: nowIso() } : t));
      return res(message, 201);
    }
  }
  if (method === 'patch' && /^\/threads\/[^/]+$/.test(url)) {
    const id = url.split('/')[2];
    messageThreads = messageThreads.map((t) => (t.id === id ? { ...t, unread: false } : t));
    return res({ message: 'updated' });
  }

  // BILLING
  if (url === '/billing/settings') {
    if (method === 'get') return res(billingSettings);
    if (method === 'put') { billingSettings = { ...billingSettings, ...body }; return res({ message: 'updated' }); }
  }
  if (method === 'post' && url === '/billing/run') {
    return res({ generated: 0, lateFees: 0, reminders: 0, note: 'Demo mode — billing cycle not run.' });
  }

  return res({ error: `Demo mode: no handler for ${method.toUpperCase()} ${url}` }, 404);
};
