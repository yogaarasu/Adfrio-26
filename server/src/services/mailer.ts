import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const normalizeSmtpPass = (raw: string | undefined, host: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const noWhitespace = raw.replace(/\s+/g, "");
  if (!host) return noWhitespace;

  // Gmail app passwords are 16 alpha-numeric chars; this removes hidden copy artifacts.
  if (/gmail\.com/i.test(host)) {
    return noWhitespace.replace(/[^A-Za-z0-9]/g, "");
  }

  return noWhitespace;
};

const normalizedSmtpPass = normalizeSmtpPass(env.SMTP_PASS, env.SMTP_HOST);
const smtpConfigured = Boolean(
  env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    normalizedSmtpPass
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      requireTLS: env.SMTP_PORT !== 465,
      auth: {
        user: env.SMTP_USER,
        pass: normalizedSmtpPass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })
  : null;

let verifiedTransport = false;

const resolveFromAddress = (): string => {
  const user = env.SMTP_USER ?? "";
  const custom = env.SMTP_FROM?.trim();
  if (!custom) {
    return `Adfrio <${user}>`;
  }

  const match = custom.match(/<([^>]+)>/);
  const customEmail = (match ? match[1] : custom).trim().toLowerCase();
  if (customEmail !== user.toLowerCase()) {
    return `Adfrio <${user}>`;
  }

  return custom;
};

const ensureTransportReady = async (): Promise<void> => {
  if (!transporter) {
    throw new Error("SMTP is not configured. Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS.");
  }
  if (verifiedTransport) return;
  await transporter.verify();
  verifiedTransport = true;
};

type OtpTemplateOptions = {
  title?: string;
  subtitle?: string;
};

export const sendOtpEmail = async (
  email: string,
  code: string,
  options?: OtpTemplateOptions
): Promise<void> => {
  await ensureTransportReady();
  if (!transporter) {
    throw new Error("SMTP transporter unavailable.");
  }

  const title = options?.title ?? "Email Verification Code";
  const subtitle = options?.subtitle ?? "Use this one-time code to continue securely.";
  const year = new Date().getUTCFullYear();
  const supportAddress = env.SMTP_USER ?? "security@adfrio.com";

  const html = `
  <div style="margin:0;padding:28px 16px;background:#f2f5fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;">
      <tr>
        <td style="padding:0 0 12px 2px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#475569;font-weight:700;">
          Adfrio Security Notice
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border:1px solid #dbe3f0;border-radius:18px;overflow:hidden;box-shadow:0 10px 24px rgba(15,23,42,0.05);">
          <div style="padding:22px 24px 0 24px;">
            <h1 style="margin:0;font-size:24px;line-height:1.35;color:#0f172a;">${title}</h1>
            <p style="margin:10px 0 0 0;font-size:14px;line-height:1.65;color:#475569;">${subtitle}</p>
          </div>
          <div style="padding:18px 24px 24px 24px;">
            <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#334155;">
              Enter the verification code below in the Adfrio app to continue.
            </p>
            <div style="margin:0 auto 14px auto;max-width:360px;padding:18px 20px;border:1px solid #c8d5ea;border-radius:14px;background:#f8fbff;text-align:center;">
              <span style="display:inline-block;font-size:36px;font-weight:800;letter-spacing:0.24em;color:#0f172a;">${code}</span>
            </div>
            <p style="margin:0 0 8px 0;font-size:13px;color:#334155;">
              This code expires in <strong style="color:#0f172a;">10 minutes</strong>.
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
              If you did not request this action, please ignore this email and review your account security.
            </p>
          </div>
          <div style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.6;">
            <strong style="color:#0f172a;">Security tip:</strong> Adfrio support will never ask for this code.<br/>
            Need help? Contact us at <a href="mailto:${supportAddress}" style="color:#0f172a;text-decoration:underline;">${supportAddress}</a>.
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 2px 0 2px;font-size:11px;color:#94a3b8;text-align:center;">
          &copy; ${year} Adfrio. All rights reserved.
        </td>
      </tr>
    </table>
  </div>
  `;

  await transporter.sendMail({
    from: resolveFromAddress(),
    to: email,
    subject: `Adfrio Security Code - ${title}`,
    text: `Adfrio security code: ${code}. Expires in 10 minutes. Do not share this code. If you did not request this, ignore this email or contact ${supportAddress}.`,
    html
  });
};
