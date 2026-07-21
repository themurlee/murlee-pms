const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('JWT_SECRET missing. Using an insecure dev-only default — set JWT_SECRET in .env before deploying.');
}
const SECRET = JWT_SECRET || 'dev-insecure-secret-change-in-prod';

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
};
