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

  await transporter.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to: email,
    subject: "Your Adfrio verification code",
    text: `Your OTP code is ${code}. It will expire in 10 minutes.`
  });
};
