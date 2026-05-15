export default async function ClientHubAboutPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">About Us</h1>
        <p className="mt-1 text-sm text-slate-500">Learn more about who we are and how we work</p>
      </div>

      {/* Hero Story */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-slate-900">Our Story</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          We are a team dedicated to delivering exceptional service and building lasting relationships with our clients.
          Founded with a commitment to transparency and quality, we have grown into a trusted partner for businesses
          seeking professional solutions.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Our mission is simple: make every interaction straightforward, every deliverable excellent, and every relationship
          built on trust. We believe that when our clients succeed, we succeed.
        </p>
      </div>

      {/* Values */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Transparency",
            description: "Clear communication and honest pricing. No surprises, no hidden fees.",
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ),
          },
          {
            title: "Quality",
            description: "We take pride in our work and hold ourselves to the highest standards.",
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
            ),
          },
          {
            title: "Partnership",
            description: "We view every client relationship as a true partnership, invested in your success.",
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.569-2.602M18.5 7.5h.008v.008H18.5V7.5zm-3 0h.008v.008H15.5V7.5zm3 3h.008v.008H18.5v-.008zm-3 0h.008v.008H15.5v-.008z" />
              </svg>
            ),
          },
        ].map((value) => (
          <div key={value.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 text-[var(--hub-accent)]">{value.icon}</div>
            <h3 className="text-sm font-semibold text-slate-900">{value.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{value.description}</p>
          </div>
        ))}
      </div>

      {/* Placeholder for future customization */}
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-xs text-slate-400">Company details and team information can be customized in a future phase.</p>
      </div>
    </div>
  );
}
