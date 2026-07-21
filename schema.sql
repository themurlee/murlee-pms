-- Schema Foundation
-- All statements use IF NOT EXISTS so `npm run db:init` is safe to re-run.

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'landlord' CHECK (role IN ('landlord')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Entity = a legal ownership vehicle (e.g. an LLC) that properties are grouped
-- under for bookkeeping / per-entity tax reporting. Single receiving account for
-- now; entities are organizational, not payment-routing.
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) DEFAULT 'LLC',
    ein VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    nickname VARCHAR(255) NOT NULL,
    address JSONB NOT NULL,
    -- Placeholder landlord-entered rent-roll estimate, shown until income is
    -- computed for real from leases/invoices in a later pass.
    estimated_rent_roll DECIMAL(12, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    unit_number VARCHAR(50) NOT NULL,
    beds INT,
    baths FLOAT,
    sq_ft INT
);

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50) UNIQUE,
    role VARCHAR(50) DEFAULT 'tenant' CHECK (role IN ('landlord', 'tenant'))
);

CREATE TABLE IF NOT EXISTS leases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
    tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
    rent_amount DECIMAL(12, 2) NOT NULL,
    due_day INT DEFAULT 1 CHECK (due_day >= 1 AND due_day <= 31),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'eviction')),
    delinquency_notes TEXT,
    eviction_notes TEXT,
    housing_authority VARCHAR(255),
    payment_plan JSONB, -- Stores dates and amounts, e.g., [{"date": "2026-10-25", "amount": 707.50}]
    CONSTRAINT valid_dates CHECK (start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
    due_date DATE NOT NULL,
    amount_due DECIMAL(12, 2) NOT NULL,
    late_fee DECIMAL(12, 2) DEFAULT 0.00,
    late_fee_waived BOOLEAN DEFAULT FALSE,
    -- First-of-month the invoice bills for; used to keep monthly auto-generation
    -- idempotent (a lease gets at most one invoice per billing period).
    billing_period DATE,
    late_fee_applied_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'overdue', 'processing')),
    transfer_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lease_id, billing_period)
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plaid_transaction_id VARCHAR(255) UNIQUE,
    plaid_transfer_id VARCHAR(255) UNIQUE REFERENCES invoices(transfer_id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    category VARCHAR(100), -- Maps to IRS Schedule E
    transaction_date DATE NOT NULL,
    description TEXT,
    reviewed BOOLEAN DEFAULT FALSE,
    classification_flag VARCHAR(50) DEFAULT 'auto',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    issue_description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    channel VARCHAR(20) CHECK (channel IN ('email', 'sms', 'portal', 'manual')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One row per landlord: drives auto invoice generation, late-fee assessment,
-- and rent reminders. Landlord-editable from the UI.
CREATE TABLE IF NOT EXISTS billing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    late_fee_amount DECIMAL(12, 2) DEFAULT 50.00,
    late_fee_grace_days INT DEFAULT 5,
    reminder_days_before INT DEFAULT 3,
    late_fee_enabled BOOLEAN DEFAULT TRUE,
    reminders_enabled BOOLEAN DEFAULT TRUE
);

-- Log of every outbound communication (email now; channel kept for future SMS).
-- Doubles as the landlord's communications history in the UI.
CREATE TABLE IF NOT EXISTS notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    ticket_id UUID REFERENCES maintenance_tickets(id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('rent_reminder', 'late_notice', 'maintenance_update', 'payment_confirmation', 'adhoc')),
    channel VARCHAR(20) DEFAULT 'email',
    to_email VARCHAR(255),
    subject VARCHAR(255),
    body TEXT,
    status VARCHAR(20) DEFAULT 'logged' CHECK (status IN ('sent', 'failed', 'logged')),
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes: every join/filter below is exercised by the invoice, dashboard, and
-- CRUD/notice/billing endpoints. Base schema had zero non-PK indexes.
CREATE INDEX IF NOT EXISTS idx_units_property_id ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_unit_id ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status);
CREATE INDEX IF NOT EXISTS idx_invoices_lease_id ON invoices(lease_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_period ON invoices(billing_period);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_entity_id ON transactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_unit_id ON maintenance_tickets(unit_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status ON maintenance_tickets(status);
CREATE INDEX IF NOT EXISTS idx_properties_owner_id ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_entity_id ON properties(entity_id);
CREATE INDEX IF NOT EXISTS idx_notices_owner_created ON notices(owner_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Incremental columns for existing tables. CREATE TABLE IF NOT EXISTS above
-- won't alter tables that already exist, so richer product fields are added
-- here with ADD COLUMN IF NOT EXISTS (safe to re-run on any DB).
-- ---------------------------------------------------------------------------

-- Properties: type classification (single-family, multi-family, etc.)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_type VARCHAR(50) DEFAULT 'Single-Family';

-- Units: per-unit market rent (DoorLoop-style), independent of an active lease.
ALTER TABLE units ADD COLUMN IF NOT EXISTS market_rent DECIMAL(12, 2) DEFAULT 0;

-- Maintenance tickets: property link, priority, category, reported date.
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general';
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS reported_at DATE DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_property_id ON maintenance_tickets(property_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_priority ON maintenance_tickets(priority);

-- Transactions: owner scoping + per-transaction property tagging, real-estate vs
-- personal class (personal excluded from Schedule E), origin source, and review memo.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_class VARCHAR(20) DEFAULT 'real_estate' CHECK (account_class IN ('real_estate', 'personal'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'csv', 'plaid'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS memo TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_owner_id ON transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_property_id ON transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_class ON transactions(account_class);

-- Invoices: exact payment timestamp (distinct from due_date), used by the
-- Rent Collection Ledger, Tenant Ledger, and Rent Roll views.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
