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
