const { hashPassword, comparePassword, generateToken, verifyToken } = require('../src/services/authService');

describe('authService', () => {
  test('hashPassword produces a hash that comparePassword can verify', async () => {
    const hash = await hashPassword('password123');
    expect(hash).not.toBe('password123');
    await expect(comparePassword('password123', hash)).resolves.toBe(true);
    await expect(comparePassword('wrongpassword', hash)).resolves.toBe(false);
  });

  test('generateToken/verifyToken round-trip carries user identity', () => {
    const user = { id: 'u1', email: 'landlord@murlee.test', name: 'Demo Landlord', role: 'landlord' };
    const token = generateToken(user);
    const payload = verifyToken(token);

    expect(payload.id).toBe(user.id);
    expect(payload.email).toBe(user.email);
    expect(payload.role).toBe('landlord');
  });

  test('verifyToken rejects a tampered token', () => {
    const token = generateToken({ id: 'u1', email: 'a@b.com', name: 'A', role: 'landlord' });
    expect(() => verifyToken(`${token}tampered`)).toThrow();
  });
});
