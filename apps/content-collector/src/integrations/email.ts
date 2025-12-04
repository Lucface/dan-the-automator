/**
 * Email Ingestion Service
 *
 * Monitor an email inbox for content to capture
 */

import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { CaptureService } from '../services/capture.js';

export class EmailIngestion {
  private imap: Imap;
  private captureService: CaptureService;
  private checkInterval: number;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.captureService = new CaptureService();
    this.checkInterval = parseInt(process.env.EMAIL_CHECK_INTERVAL || '60') * 1000;

    this.imap = new Imap({
      user: process.env.EMAIL_IMAP_USER || '',
      password: process.env.EMAIL_IMAP_PASSWORD || '',
      host: process.env.EMAIL_IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.imap.on('error', (err: Error) => {
      console.error('IMAP error:', err);
    });

    this.imap.on('end', () => {
      console.log('IMAP connection ended');
    });
  }

  /**
   * Start monitoring the inbox
   */
  start(): void {
    console.log('📧 Starting email ingestion...');

    // Check immediately
    this.checkInbox();

    // Then check on interval
    this.intervalId = setInterval(() => {
      this.checkInbox();
    }, this.checkInterval);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.imap.end();
  }

  /**
   * Check inbox for new emails
   */
  private async checkInbox(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.once('ready', () => {
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            console.error('Failed to open inbox:', err);
            this.imap.end();
            return reject(err);
          }

          // Search for unseen emails
          this.imap.search(['UNSEEN'], (err, results) => {
            if (err) {
              console.error('Search error:', err);
              this.imap.end();
              return reject(err);
            }

            if (!results || results.length === 0) {
              this.imap.end();
              return resolve();
            }

            console.log(`📬 Found ${results.length} new emails`);

            const fetch = this.imap.fetch(results, { bodies: '' });

            fetch.on('message', (msg, seqno) => {
              msg.on('body', (stream, info) => {
                simpleParser(stream as any, async (err, parsed) => {
                  if (err) {
                    console.error('Parse error:', err);
                    return;
                  }

                  await this.processEmail(parsed);

                  // Mark as seen
                  this.imap.addFlags(seqno, ['\\Seen'], (err) => {
                    if (err) console.error('Failed to mark as seen:', err);
                  });
                });
              });
            });

            fetch.once('error', (err) => {
              console.error('Fetch error:', err);
            });

            fetch.once('end', () => {
              this.imap.end();
              resolve();
            });
          });
        });
      });

      this.imap.connect();
    });
  }

  /**
   * Process a single email and capture its content
   */
  private async processEmail(email: ParsedMail): Promise<void> {
    try {
      const subject = email.subject || '';
      const from = email.from?.text || 'unknown';

      // Parse subject for routing hints
      // Format: "for:project | category:cat | actual subject"
      let context = '';
      let cleanSubject = subject;

      const hintMatch = subject.match(/^(.+?)\s*\|\s*(.+)$/);
      if (hintMatch) {
        context = hintMatch[1].trim();
        cleanSubject = hintMatch[2].trim();
      }

      // Build content from email body
      let content = '';

      // Add subject as context if it's meaningful
      if (cleanSubject && cleanSubject.toLowerCase() !== 'capture') {
        content += cleanSubject + '\n\n';
      }

      // Add text body
      if (email.text) {
        content += email.text;
      }

      // Handle attachments
      if (email.attachments && email.attachments.length > 0) {
        for (const attachment of email.attachments) {
          content += `\n\n[ATTACHMENT: ${attachment.filename}]`;

          // TODO: Save attachment to storage and reference it
        }
      }

      // Capture the content
      await this.captureService.capture({
        content: content.trim(),
        context: context || `Email from ${from}: ${cleanSubject}`,
        source: 'email',
        sourceMetadata: {
          from: from,
          subject: subject,
          date: email.date?.toISOString(),
          messageId: email.messageId
        }
      });

      console.log(`✅ Captured email: "${cleanSubject}" from ${from}`);

    } catch (error) {
      console.error('Failed to process email:', error);
    }
  }
}
