import { formatMessage, type Locale, type MessageKey } from "@/lib/i18n/messages"

const HOME_FAQ_IDS = ["free", "account", "timezones", "countUp", "share", "embed", "recurring"] as const

type HomeFaqId = (typeof HOME_FAQ_IDS)[number]
type HomeFaqKey = `home.faq.${HomeFaqId}.${"answer" | "question"}`
type HomeFaq = Readonly<{ question: string; answer: string }>

function homeFaqKey(id: HomeFaqId, field: "answer" | "question"): MessageKey {
  return `home.faq.${id}.${field}` satisfies HomeFaqKey
}

// Dynamic keys:
// home.faq.free.question home.faq.free.answer
// home.faq.account.question home.faq.account.answer
// home.faq.timezones.question home.faq.timezones.answer
// home.faq.countUp.question home.faq.countUp.answer
// home.faq.share.question home.faq.share.answer
// home.faq.embed.question home.faq.embed.answer
// home.faq.recurring.question home.faq.recurring.answer
export function getHomeFaqs(locale: Locale): readonly HomeFaq[] {
  return HOME_FAQ_IDS.map((id) => ({
    question: formatMessage(homeFaqKey(id, "question"), {}, locale),
    answer: formatMessage(homeFaqKey(id, "answer"), {}, locale),
  }))
}
