import nodemailer from 'nodemailer';
import { Logger } from '../logging/Logger.js';

export class Mailer {
    private static instance: Mailer | null = null;
    private logger = Logger.getInstance();
    private enabled: boolean;
    private from: string | undefined;
    private transporter: nodemailer.Transporter | null = null;

    private constructor() {
        const host = process.env.SMTP_HOST;
        const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;
        this.from = process.env.MAIL_FROM;

        this.enabled = Boolean(host && port && this.from);

        if (this.enabled) {
            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure: port === 465, // common default
                auth: user && pass ? { user, pass } : undefined,
            });
            this.logger.info('Mailer initialized', { host, port, from: this.from });
        } else {
            this.logger.warn('Mailer disabled - missing SMTP configuration (SMTP_HOST, SMTP_PORT, MAIL_FROM)');
        }
    }

    static getInstance(): Mailer {
        if (!Mailer.instance) Mailer.instance = new Mailer();
        return Mailer.instance;
    }

    async send(subject: string, text: string, html?: string, to?: string): Promise<void> {
        if (!this.enabled || !this.transporter || !this.from) {
            this.logger.debug('Mailer.send skipped (disabled or not configured)');
            return;
        }

        if (!to) {
            this.logger.warn('Mailer.send called without recipient email (to parameter)');
            return;
        }

        try {
            await this.transporter.sendMail({
                from: this.from,
                to: to,
                subject,
                text,
                html: html ?? `<pre>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
            });
            this.logger.info('Email sent', { subject, to });
        } catch (err) {
            this.logger.error('Failed to send email', err as Error, { subject, to });
        }
    }
}


