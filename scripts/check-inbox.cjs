const Imap = require('imap');
const { simpleParser } = require('mailparser');

const imap = new Imap({
  user: 'sopark.worker@gmail.com',
  password: 'pwccjamxvjdovqjk',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
});

const searchTerm = process.argv[2] || 'github';

imap.once('ready', () => {
  imap.openBox('INBOX', true, (err, box) => {
    if (err) { console.error(err); imap.end(); return; }
    
    imap.search([['OR', ['FROM', searchTerm], ['SUBJECT', searchTerm]]], (err, results) => {
      if (err) { console.error(err); imap.end(); return; }
      if (!results.length) {
        console.log('No emails found matching:', searchTerm);
        imap.end();
        return;
      }
      
      const latest = results.slice(-5);
      const fetch = imap.fetch(latest, { bodies: '', struct: true });
      
      fetch.on('message', (msg) => {
        msg.on('body', (stream) => {
          simpleParser(stream, (err, parsed) => {
            if (err) return;
            console.log('\n---');
            console.log('From:', parsed.from?.text);
            console.log('Subject:', parsed.subject);
            console.log('Date:', parsed.date);
            console.log('Body:', (parsed.text || '').slice(0, 800));
          });
        });
      });
      
      fetch.once('end', () => imap.end());
    });
  });
});

imap.once('error', (err) => console.error('IMAP error:', err.message));
imap.connect();
