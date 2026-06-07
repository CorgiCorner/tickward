import { formatMessage } from "@/lib/i18n/messages"
import { getSiteHostname } from "@/lib/site-config"

export const socialImageSize = {
  width: 1200,
  height: 630,
}

export const socialImageContentType = "image/png"

export function socialImageAlt() {
  return formatMessage("app.socialImage.alt")
}

export function SocialImage() {
  const title = formatMessage("app.title.default")
  const description = formatMessage("app.og.description")
  const siteHostname = getSiteHostname()
  const titleLines = title
    .replace(" to ", "\nto ")
    .split("\n")
    .map((line) => line.split(" "))

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        background: "#111214",
        color: "#f7f4ec",
        overflow: "hidden",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          backgroundImage: [
            "radial-gradient(circle at 2px 2px, rgba(247,244,236,0.22) 2px, transparent 0)",
            "linear-gradient(135deg, rgba(247,244,236,0.12) 0 1px, transparent 1px 34px)",
            "linear-gradient(45deg, rgba(120,191,172,0.16) 0 1px, transparent 1px 42px)",
          ].join(", "),
          backgroundSize: "30px 30px, 68px 68px, 84px 84px",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "linear-gradient(90deg, rgba(17,18,20,0.96) 0%, rgba(17,18,20,0.88) 50%, rgba(17,18,20,0.68) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 520,
          display: "flex",
          backgroundImage: [
            "linear-gradient(90deg, transparent 0%, rgba(120,191,172,0.1) 44%, rgba(247,244,236,0.1) 100%)",
            "radial-gradient(circle at 2px 2px, rgba(247,244,236,0.2) 2px, transparent 0)",
          ].join(", "),
          backgroundSize: "100% 100%, 26px 26px",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "62px 72px 58px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <LogoMark />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", fontSize: 32, fontWeight: 800, letterSpacing: 0 }}>tickward</div>
              <div style={{ display: "flex", color: "rgba(247,244,236,0.58)", fontSize: 18, letterSpacing: 0 }}>
                {formatMessage("app.og.subtitle")}
              </div>
            </div>
          </div>
          <Badge text={formatMessage("app.og.openSource")} strong />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 800 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              color: "#fffdf7",
              fontSize: 70,
              fontWeight: 820,
              letterSpacing: 0,
              lineHeight: 1.01,
            }}
          >
            {titleLines.map((line, lineIndex) => (
              <span key={`${lineIndex}-${line.join("-")}`} style={{ display: "flex", gap: 10 }}>
                {line.map((word, wordIndex) => (
                  <span key={`${wordIndex}-${word}`} style={{ display: "flex" }}>
                    {word}
                  </span>
                ))}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 760,
              color: "rgba(247,244,236,0.74)",
              fontSize: 27,
              lineHeight: 1.34,
              letterSpacing: 0,
            }}
          >
            {description}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 28 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Badge text={formatMessage("app.og.badge.vacation")} />
            <Badge text={formatMessage("app.og.badge.meeting")} />
            <Badge text={formatMessage("app.og.badge.event")} />
          </div>
          <div style={{ display: "flex", color: "rgba(247,244,236,0.52)", fontSize: 20 }}>{siteHostname}</div>
        </div>
      </div>
    </div>
  )
}

function LogoMark() {
  return (
    <div
      style={{
        width: 68,
        height: 68,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 18,
        background: "#050505",
        border: "1px solid rgba(247,244,236,0.28)",
        color: "#f7f4ec",
        boxShadow: "0 16px 48px rgba(0,0,0,0.26)",
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="52" height="52" fill="none">
        <rect width="512" height="512" rx="0" fill="#050505" />
        <circle cx="256" cy="276" r="160" stroke="#ffffff" strokeWidth="28" />
        <path d="M224 70h64" stroke="#ffffff" strokeLinecap="round" strokeWidth="28" />
        <path d="M256 88v56" stroke="#ffffff" strokeLinecap="round" strokeWidth="28" />
        <path d="M256 276V166" stroke="#ffffff" strokeLinecap="round" strokeWidth="28" />
        <path d="M256 276h104" stroke="#ffffff" strokeLinecap="round" strokeWidth="28" />
      </svg>
    </div>
  )
}

function Badge(props: Readonly<{ text: string; strong?: boolean }>) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: props.strong ? "12px 16px" : "10px 14px",
        borderRadius: 999,
        background: props.strong ? "rgba(120,191,172,0.18)" : "rgba(247,244,236,0.08)",
        border: props.strong ? "1px solid rgba(120,191,172,0.52)" : "1px solid rgba(247,244,236,0.12)",
        color: props.strong ? "#d7fff3" : "rgba(247,244,236,0.76)",
        fontSize: props.strong ? 18 : 17,
        fontWeight: 700,
        letterSpacing: 0,
      }}
    >
      {props.text}
    </div>
  )
}
