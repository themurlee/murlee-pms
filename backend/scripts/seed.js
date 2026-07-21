// Seeds a demo landlord + a small realistic portfolio so auto-invoicing,
// reports, and entity bookkeeping have real data to work on. Idempotent: keyed
// on the landlord email, re-running wipes and re-inserts that landlord's data.
// Usage: npm run db:seed
const pool = require('../src/config/db');
const { hashPassword } = require('../src/services/authService');

const LANDLORD_EMAIL = 'landlord@murlee.test';
const LANDLORD_PASSWORD = 'password123';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — nothing to seed. Add it to ../.env first.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fresh start for this landlord's data (leave other data untouched).
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [LANDLORD_EMAIL]);
    if (existing.rows.length > 0) {
      const uid = existing.rows[0].id;
      const ownedUnits = `SELECT u.id FROM units u JOIN properties p ON u.property_id = p.id WHERE p.owner_id = $1`;

      // Capture tenant ids linked to this owner BEFORE deleting the leases that
      // establish that link (tenants may have been re-emailed, so email match
      // alone isn't reliable).
      const tenantIds = (await client.query(
        `SELECT DISTINCT tenant_id FROM leases WHERE unit_id IN (${ownedUnits})`,
        [uid]
      )).rows.map((r) => r.tenant_id).filter(Boolean);

      // Invoices RESTRICT deletion of their lease, so clear them (and dependent
      // transactions) before the leases, then the leases themselves.
      await client.query(
        `DELETE FROM transactions WHERE invoice_id IN (
           SELECT i.id FROM invoices i WHERE i.lease_id IN (SELECT id FROM leases WHERE unit_id IN (${ownedUnits}))
         )`,
        [uid]
      );
      await client.query(
        `DELETE FROM invoices WHERE lease_id IN (SELECT id FROM leases WHERE unit_id IN (${ownedUnits}))`,
        [uid]
      );
      await client.query(`DELETE FROM leases WHERE unit_id IN (${ownedUnits})`, [uid]);
      await client.query('DELETE FROM users WHERE id = $1', [uid]); // cascades entities, properties, units, billing_settings, notices

      if (tenantIds.length > 0) {
        await client.query(`DELETE FROM tenants WHERE id = ANY($1)`, [tenantIds]);
      }
      await client.query(`DELETE FROM tenants WHERE email IN ('jane@example.com', 'john@example.com')`);
    }

    const passwordHash = await hashPassword(LANDLORD_PASSWORD);
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'landlord') RETURNING id`,
      [LANDLORD_EMAIL, passwordHash, 'Demo Landlord']
    );
    const ownerId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO billing_settings (owner_id) VALUES ($1)`,
      [ownerId]
    );

    const entityRes = await client.query(
      `INSERT INTO entities (owner_id, name, entity_type, ein) VALUES ($1, $2, 'LLC', $3) RETURNING id`,
      [ownerId, 'Jayam Realty LLC', '88-1234567']
    );
    const entityId = entityRes.rows[0].id;

    // Two properties, one unit each, one active lease each. due_day set so the
    // manual "Run billing cycle now" button generates an invoice today.
    const today = new Date();
    const dueDay = today.getUTCDate();

    const props = [
      { nickname: 'Oakridge Manor', address: { street: '128 Oakridge Dr', city: 'Atlanta', state: 'GA', zip: '30301' }, type: 'Multi-Family', tenant: { name: 'Jane Doe', email: 'jane@example.com', phone: '555-0199' }, rent: 1400 },
      { nickname: 'Pacific Breeze', address: { street: '445 Coastline Hwy', city: 'San Diego', state: 'CA', zip: '92101' }, type: 'Single-Family', tenant: { name: 'John Smith', email: 'john@example.com', phone: '555-0144' }, rent: 1350 },
    ];

    for (const p of props) {
      const propRes = await client.query(
        `INSERT INTO properties (owner_id, entity_id, nickname, address, property_type, estimated_rent_roll)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [ownerId, entityId, p.nickname, JSON.stringify(p.address), p.type, p.rent]
      );
      const propertyId = propRes.rows[0].id;

      const unitRes = await client.query(
        `INSERT INTO units (property_id, unit_number, beds, baths, sq_ft, market_rent) VALUES ($1, '101', 2, 1, 850, $2) RETURNING id`,
        [propertyId, p.rent]
      );
      const unitId = unitRes.rows[0].id;

      const tenantRes = await client.query(
        `INSERT INTO tenants (name, email, phone, role) VALUES ($1, $2, $3, 'tenant') RETURNING id`,
        [p.tenant.name, p.tenant.email, p.tenant.phone]
      );
      const tenantId = tenantRes.rows[0].id;

      await client.query(
        `INSERT INTO leases (unit_id, tenant_id, rent_amount, due_day, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, '2026-01-01', '2026-12-31', 'active')`,
        [unitId, tenantId, p.rent, dueDay]
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded landlord ${LANDLORD_EMAIL} / ${LANDLORD_PASSWORD}`);
    console.log(`  1 entity, ${props.length} properties/units/tenants/leases (due_day=${dueDay}), default billing settings.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
