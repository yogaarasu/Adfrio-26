import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    })
  : null;

export const sendOtpEmail = async (email: string, code: string): Promise<void> => {
  if (!transporter) {
    console.log(`[DEV OTP] ${email}: ${code}`);
    return;
  }

  const html = `
  <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:20px 24px;background:#111827;color:#ffffff;">
          <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.85;">Adfrio</div>
          <div style="margin-top:6px;font-size:20px;font-weight:700;">Email Verification Code</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 14px 0;font-size:14px;color:#374151;">
            Use the one-time verification code below to continue signing in.
          </p>
          <div style="margin:0 auto 14px auto;max-width:260px;padding:14px 16px;border:1px dashed #9ca3af;border-radius:12px;background:#f9fafb;text-align:center;">
            <span style="font-size:32px;font-weight:800;letter-spacing:0.28em;color:#111827;">${code}</span>
          </div>
          <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">This code will expire in <strong>10 minutes</strong>.</p>
          <p style="margin:0;font-size:13px;color:#6b7280;">If you did not request this, you can safely ignore this email.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;border-top:1px solid #e5e7eb;background:#fafafa;font-size:12px;color:#6b7280;">
          For security, never share this code with anyone.
        </td>
      </tr>
    </table>
  </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to: email,
    subject: "Your Adfrio verification code",
    text: `Your OTP code is ${code}. It will expire in 10 minutes. If you did not request this, ignore this email.`,
    html
  });
};
