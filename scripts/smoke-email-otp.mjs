const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000"
const email = process.env.SMOKE_EMAIL_TO?.trim()

function maskEmail(value) {
  const [local, domain] = value.split("@")
  if (!local || !domain) return "<invalid-email>"
  return `${local.slice(0, 2)}***@${domain}`
}

if (!email) {
  console.log("SMOKE_EMAIL_TO is not set; skipping email OTP request smoke.")
  process.exit(0)
}

const url = new URL("/api/auth/email-otp/send-verification-otp", baseUrl)

const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email,
    type: "sign-in",
  }),
})

if (!res.ok) {
  const text = await res.text().catch(() => "")
  throw new Error(`Email OTP request smoke failed with ${res.status}: ${text.slice(0, 240)}`)
}

const data = await res.json().catch(() => null)
if (!data?.success) {
  throw new Error("Email OTP request smoke did not return success=true.")
}

console.log(`Email OTP request smoke requested a sign-in code for ${maskEmail(email)}.`)
