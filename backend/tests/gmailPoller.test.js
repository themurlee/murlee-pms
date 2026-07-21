const { extractMessageFields } = require('../src/lib/gmailPoller');

describe('extractMessageFields', () => {
  test('extracts sender, subject, plain-text body, and threading headers from a parsed message', () => {
    const parsed = {
      from: { value: [{ address: 'jane@example.com', name: 'Jane Doe' }] },
      subject: 'Re: Leak in bathroom',
      text: 'Thanks, someone came by already.\n',
      messageId: '<in-2@mail.gmail.com>',
      inReplyTo: '<out-1@gmail.com>',
    };

    expect(extractMessageFields(parsed)).toEqual({
      fromEmail: 'jane@example.com',
      fromName: 'Jane Doe',
      subject: 'Re: Leak in bathroom',
      body: 'Thanks, someone came by already.',
      gmailMessageId: '<in-2@mail.gmail.com>',
      inReplyTo: '<out-1@gmail.com>',
    });
  });

  test('falls back to a placeholder subject and null fields when headers are missing', () => {
    const parsed = { from: { value: [{ address: 'stranger@example.com' }] }, text: 'Hello' };

    expect(extractMessageFields(parsed)).toEqual({
      fromEmail: 'stranger@example.com',
      fromName: null,
      subject: '(no subject)',
      body: 'Hello',
      gmailMessageId: null,
      inReplyTo: null,
    });
  });
});

describe('pollOnce', () => {
  test('attaches an error listener to the IMAP client so a socket error cannot crash the process', async () => {
    jest.resetModules();

    const onSpy = jest.fn();
    jest.doMock('imapflow', () => ({
      ImapFlow: jest.fn().mockImplementation(() => ({
        on: onSpy,
        connect: jest.fn().mockResolvedValue(undefined),
        logout: jest.fn().mockResolvedValue(undefined),
        getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
        fetch: () => (async function* () {})(),
        messageFlagsAdd: jest.fn(),
      })),
    }));
    jest.doMock('mailparser', () => ({ simpleParser: jest.fn() }));

    const { pollOnce } = require('../src/lib/gmailPoller');
    await pollOnce({ query: jest.fn() }, 'owner-1');

    expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
