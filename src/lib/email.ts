import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  if (!resend) {
    throw new Error(
      "Email provider is not configured. Set RESEND_API_KEY environment variable to send emails."
    );
  }
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@slipwise.app",
    to,
    subject,
    html,
  });
}

export function verifyEmailHtml({ url, name }: { url: string; name: string }): string {
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">Verify your email</h1>
      <p style="color: #555; margin-bottom: 24px;">Hi ${name}, please verify your email to activate your Slipwise account.</p>
      <a href="${url}" style="display: inline-block; background: #dc2626; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Verify Email</a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't sign up, ignore this email.</p>
    </div>
  `;
}

export function resetPasswordEmailHtml({ url, name }: { url: string; name: string }): string {
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">Reset your password</h1>
      <p style="color: #555; margin-bottom: 24px;">Hi ${name}, click the link below to reset your password. This link expires in 1 hour.</p>
      <a href="${url}" style="display: inline-block; background: #dc2626; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Reset Password</a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't request this, ignore this email.</p>
    </div>
  `;
}

export function otpEmailHtml({ otp }: { otp: string }): string {
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">Your verification code</h1>
      <p style="color: #555; margin-bottom: 24px;">Use the code below to verify your account. It expires in 10 minutes.</p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #1a1a1a;">${otp}</span>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't request this, ignore this email.</p>
    </div>
  `;
}

export function clientHubInviteEmailHtml({
  url,
  orgName,
  customerName,
}: {
  url: string;
  orgName: string;
  customerName: string;
}): string {
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">Your Client Hub is ready</h1>
      <p style="color: #555; margin-bottom: 24px;">Hi ${customerName},</p>
      <p style="color: #555; margin-bottom: 24px;">You can now access your personalized client hub for ${orgName}. Review invoices, quotes, and stay up to date with your account.</p>
      <a href="${url}" style="display: inline-block; background: #dc2626; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open Client Hub</a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">Sign in with your email to receive a one-time verification code. If you have any questions, reply to this email.</p>
      <p style="color: #999; font-size: 12px; margin-top: 8px;">${url}</p>
    </div>
  `;
}
