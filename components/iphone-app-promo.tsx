import Link from "next/link"

import { dialScale } from "@/components/iphone/dial-scale"
import styles from "@/components/iphone/iphone.module.css"
import { TickDial } from "@/components/iphone/tick-dial"
import { formatMessage, localeHref, type Locale } from "@/lib/i18n/messages"

// 2 days and 10 hours: the hour scale, as on the iPhone app page.
const PREVIEW_SCALE = dialScale(2 * 86_400 + 10 * 3_600)

export function IphoneAppPromo(props: Readonly<{ locale: Locale }>) {
  const t = (key: Parameters<typeof formatMessage>[0]) => formatMessage(key, {}, props.locale)
  return (
    <section aria-labelledby="iphone-app-promo-title">
      <div className="mx-auto w-full max-w-[640px] px-4 pb-6">
        <div className={`${styles.stage} rounded-xl p-5 sm:p-6`}>
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[rgb(250_250_250/0.62)]">{t("iphone.badge")}</p>
              <h2 id="iphone-app-promo-title" className="mt-1 text-lg font-semibold tracking-tight">
                {t("iphone.title")}
              </h2>
              <p className="mt-2 max-w-[380px] text-sm leading-6 text-[rgb(250_250_250/0.62)]">
                {t("iphone.promo.body")}
              </p>
              <Link
                href={localeHref(props.locale, "/iphone")}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#fafafa] px-4 py-2 text-sm font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5532d]"
              >
                {t("iphone.promo.cta")}
              </Link>
            </div>
            <div className="mx-auto size-[120px] sm:size-[140px]" aria-hidden="true">
              <TickDial scale={PREVIEW_SCALE} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
