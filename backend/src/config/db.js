const { Pool } = require('pg');

let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
} else {
  console.warn('DATABASE_URL missing. Using mock database interface.');
  pool = {
    connect: async () => ({
      query: async (text, params) => {
        console.log(`[MOCK DB QUERY]: ${text}`, params);
        if (text.includes('SELECT id FROM invoices')) {
          return { rows: [{ id: 'mock-invoice-uuid' }] };
        }
        if (text.includes('SELECT id FROM tenants')) {
          return { rows: [{ id: 'mock-tenant-uuid' }] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
    query: async (text, params) => {
      console.log(`[MOCK DB QUERY]: ${text}`, params);
      return { rows: [] };
    }
  };
}

module.exports = pool;
