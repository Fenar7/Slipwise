// Phase 1 static shell: contact info uses static placeholders.
// Future phases will wire org-specific support details from the layout context.
const SUPPORT_EMAIL = "support@example.com";
const SUPPORT_PHONE = "+91 00000 00000";

export default async function ClientHubContactPage() {
  const supportEmail = SUPPORT_EMAIL;
  const supportPhone = SUPPORT_PHONE;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contact Us</h1>
        <p className="mt-1 text-sm text-slate-500">We&apos;re here to help. Reach out through any channel below.</p>
      </div>

      {/* Contact Methods */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: "Email",
            value: supportEmail,
            href: `mailto:${supportEmail}`,
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            ),
          },
          {
            title: "Phone",
            value: supportPhone,
            href: `tel:${supportPhone}`,
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            ),
          },
          {
            title: "Business Hours",
            value: "Mon – Fri, 9:00 AM – 6:00 PM IST",
            href: undefined,
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          },
        ].map((method) => (
          <div key={method.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 text-[var(--hub-accent)]">{method.icon}</div>
            <h3 className="text-sm font-semibold text-slate-900">{method.title}</h3>
            {method.href ? (
              <a href={method.href} className="mt-1 text-sm hub-accent-text hover:underline block">
                {method.value}
              </a>
            ) : (
              <p className="mt-1 text-sm text-slate-600">{method.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Support framing */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">How can we help?</h2>
        <p className="mt-2 text-sm text-slate-600">
          For questions about invoices, quotes, or payments, please include the document number in your message
          so we can assist you faster.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          For urgent matters outside business hours, please email us and we will respond as soon as possible.
        </p>
      </div>

      {/* Escalation placement */}
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-xs text-slate-400">
          Escalation paths and live chat will be available in a future phase.
        </p>
      </div>
    </div>
  );
}
