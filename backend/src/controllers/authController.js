const pool = require('../config/db');
const { comparePassword, generateToken } = require('../services/authService');

const MOCK_USER = {
  id: 'mock-user-uuid',
  email: 'landlord@murlee.test',
  password: 'password123',
  name: 'Demo Landlord',
  role: 'landlord',
};

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (!process.env.DATABASE_URL) {
    if (email !== MOCK_USER.email || password !== MOCK_USER.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = { id: MOCK_USER.id, email: MOCK_USER.email, name: MOCK_USER.name, role: MOCK_USER.role };
    return res.json({ token: generateToken(user), user });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const row = result.rows[0];
    if (!row || !(await comparePassword(password, row.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = { id: row.id, email: row.email, name: row.name, role: row.role };
    res.json({ token: generateToken(user), user });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, me };
