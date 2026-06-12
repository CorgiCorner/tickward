type FaqItem = Readonly<{ question: string; answer: string }>

type FaqSectionProps = Readonly<{
  heading: string
  faqs: readonly FaqItem[]
}>

export function FaqSection({ heading, faqs }: FaqSectionProps) {
  return (
    <section className="grid gap-5">
      <h2 className="text-xl font-semibold tracking-normal">{heading}</h2>
      <div className="grid gap-4">
        {faqs.map((faq) => (
          <article key={faq.question} className="grid gap-1 rounded-xl border bg-card p-4">
            <h3 className="text-base font-semibold tracking-normal">{faq.question}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
