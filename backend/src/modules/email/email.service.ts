import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER, EmailProvider } from './email-provider.interface';

/**
 * The single place transactional email content is composed (Website
 * phase spec "Email notifications"). Every send is best-effort from the
 * caller's point of view - see AuthService.createCompanyWithOwner, which
 * wraps these calls in try/catch so a broken email provider can never
 * fail registration itself (the account/subscription is real and usable
 * either way; the verification email is a courtesy, not a precondition -
 * see docs/WEBSITE.md "Email verification" for why it's not a hard gate
 * yet).
 *
 * Only the two flows actually wired into this phase are implemented
 * (verification, welcome). The rest of the spec's email list (trial
 * ending/expired, payment succeeded/failed, subscription cancelled,
 * affiliate conversion) has no trigger to hang off yet - same "no
 * background job scheduler in this codebase" reasoning
 * SubscriptionService's lazy trial-expiry check already documents
 * (docs/DOMAIN_MODEL.md "SaaS / Subscription" "Why no cron"). Adding a
 * fake/manual call site for them would be worse than not sending them at
 * all - see docs/WEBSITE.md "Known gaps".
 */
@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  private websiteBaseUrl(): string {
    return this.config.get<string>('WEBSITE_BASE_URL') ?? 'http://localhost:5173';
  }

  async sendVerificationEmail(params: { to: string; fullName: string; token: string }) {
    const link = `${this.websiteBaseUrl()}/verify-email?token=${encodeURIComponent(params.token)}`;
    await this.provider.send({
      to: params.to,
      subject: 'تأكيد بريدك الإلكتروني - قيّدها',
      html: `
        <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#0f766e;">قيّدها</h2>
          <p>مرحبًا ${escapeHtml(params.fullName)}،</p>
          <p>يرجى تأكيد بريدك الإلكتروني لإكمال إعداد حسابك.</p>
          <p><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">تأكيد البريد الإلكتروني</a></p>
          <p style="color:#64748b;font-size:13px;">هذا الرابط صالح لمدة 24 ساعة. إن لم تطلب إنشاء هذا الحساب، تجاهل هذه الرسالة.</p>
          <p style="color:#64748b;font-size:13px;">للدعم: support@qeedha.local</p>
        </div>
      `,
    });
  }

  async sendWelcomeEmail(params: { to: string; fullName: string; companyName: string }) {
    await this.provider.send({
      to: params.to,
      subject: `مرحبًا بك في قيّدها، ${params.fullName}`,
      html: `
        <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#0f766e;">قيّدها</h2>
          <p>مرحبًا ${escapeHtml(params.fullName)}،</p>
          <p>تم إنشاء حساب "${escapeHtml(params.companyName)}" بنجاح، وبدأت فترتك التجريبية المجانية (14 يومًا).</p>
          <p>يمكنك الآن تسجيل الدخول والبدء في استخدام النظام.</p>
          <p style="color:#64748b;font-size:13px;">للدعم: support@qeedha.local</p>
        </div>
      `,
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
