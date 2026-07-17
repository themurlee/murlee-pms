-- Schema Foundation
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nickname VARCHAR(255) NOT NULL,
    address JSONB NOT NULL
);

CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    unit_number VARCHAR(50) NOT NULL,
    beds INT,
    baths FLOAT,
    sq_ft INT
);

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50) UNIQUE,
    role VARCHAR(50) DEFAULT 'tenant' CHECK (role IN ('landlord', 'tenant'))
);

CREATE TABLE leases (
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

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
    due_date DATE NOT NULL,
    amount_due DECIMAL(12, 2) NOT NULL,
    late_fee DECIMAL(12, 2) DEFAULT 0.00,
    late_fee_waived BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'overdue', 'processing')),
    transfer_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plaid_transaction_id VARCHAR(255) UNIQUE,
    plaid_transfer_id VARCHAR(255) UNIQUE REFERENCES invoices(transfer_id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    category VARCHAR(100), -- Maps to IRS Schedule E
    transaction_date DATE NOT NULL,
    description TEXT,
    reviewed BOOLEAN DEFAULT FALSE,
    classification_flag VARCHAR(50) DEFAULT 'auto',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE maintenance_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    issue_description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    channel VARCHAR(20) CHECK (channel IN ('email', 'sms')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
