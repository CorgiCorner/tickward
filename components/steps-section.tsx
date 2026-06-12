type StepItem = Readonly<{ title: string; body: string }>

type StepsSectionProps = Readonly<{
  heading: string
  steps: readonly StepItem[]
}>

export function StepsSection({ heading, steps }: StepsSectionProps) {
  return (
    <section className="grid gap-4">
      <h2 className="text-xl font-semibold tracking-normal">{heading}</h2>
      <ol className="grid gap-4">
        {steps.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[1.5rem_1fr] gap-3">
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background"
            >
              {index + 1}
            </span>
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold tracking-normal">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
