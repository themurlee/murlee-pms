describe('emailService.deliver transport selection', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.RESEND_API_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('uses Gmail nodemailer transport when GMAIL_USER + GMAIL_APP_PASSWORD are set', async () => {
    process.env.GMAIL_USER = 'landlord@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'app-password';

    const sendMail = jest.fn().mockResolvedValue({ messageId: '<abc123@gmail.com>' });
    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => ({ sendMail })),
    }));

    const emailService = require('../src/services/emailService');
    const result = await emailService.deliver('tenant@example.com', 'Hi', '<p>Hi</p>');

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'tenant@example.com', subject: 'Hi' }));
    expect(result).toEqual({ status: 'sent', messageId: '<abc123@gmail.com>' });
  });

  test('falls back to Resend when Gmail env vars are absent but RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 'test-key';

    const send = jest.fn().mockResolvedValue({ data: { id: 'resend-id-1' }, error: null });
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    }));

    const emailService = require('../src/services/emailService');
    const result = await emailService.deliver('tenant@example.com', 'Hi', '<p>Hi</p>');

    expect(send).toHaveBeenCalled();
    expect(result).toEqual({ status: 'sent', messageId: 'resend-id-1' });
  });

  test('logs only when neither Gmail nor Resend are configured', async () => {
    const emailService = require('../src/services/emailService');
    const result = await emailService.deliver('tenant@example.com', 'Hi', '<p>Hi</p>');
    expect(result).toEqual({ status: 'logged' });
  });
});
