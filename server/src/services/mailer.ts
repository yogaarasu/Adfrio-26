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

  const html = `
  <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
      <tr>
        <td style="padding:0 0 14px 2px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#475569;font-weight:700;">
          Adfrio Security
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <div style="padding:24px 24px 10px 24px;">
            <h1 style="margin:0;font-size:22px;line-height:1.35;color:#0f172a;">${title}</h1>
            <p style="margin:8px 0 0 0;font-size:14px;line-height:1.6;color:#475569;">${subtitle}</p>
          </div>
          <div style="padding:16px 24px 24px 24px;">
            <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#334155;">
              Use the verification code below to continue your request.
            </p>
            <div style="margin:0 auto 14px auto;max-width:320px;padding:14px 18px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;text-align:center;">
              <span style="display:inline-block;font-size:34px;font-weight:800;letter-spacing:0.26em;color:#0f172a;">${code}</span>
            </div>
            <p style="margin:0 0 6px 0;font-size:13px;color:#475569;">
              This code expires in <strong style="color:#0f172a;">10 minutes</strong>.
            </p>
            <p style="margin:0;font-size:13px;color:#64748b;">
              If you did not request this verification, you can safely ignore this email.
            </p>
          </div>
          <div style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.5;">
            For your safety, never share this code with anyone, including support staff.
          </div>
        </td>
      </tr>
    </table>
  </div>
  `;

  await transporter.sendMail({
    from: resolveFromAddress(),
    to: email,
    subject: `Adfrio Verification - ${title}`,
    text: `Your OTP code is ${code}. It will expire in 10 minutes. If you did not request this, ignore this email.`,
    html
  });
};
