import { getActiveLocale } from "@/lib/i18n/active-locale"

// Mono digits give the thousands separator a full cell, which spreads a count
// like 1,300 apart. Pull a comma or dot separator in from both sides so the
// number reads as one word; space separators keep their width.
const TIGHT_SEPARATORS = new Set([",", ".", "'", "’"])

export function GroupedNumber(props: Readonly<{ value: number }>) {
  const parts = new Intl.NumberFormat(getActiveLocale(), { maximumFractionDigits: 0 }).formatToParts(props.value)

  return (
    <>
      {parts.map((part, index) =>
        part.type === "group" && TIGHT_SEPARATORS.has(part.value) ? (
          // The parts list is derived from one value, so positions are stable keys.
          <span key={`${part.type}-${index}`} data-group-separator="" className="-mx-[0.17em]">
            {part.value}
          </span>
        ) : (
          part.value
        ),
      )}
    </>
  )
}
