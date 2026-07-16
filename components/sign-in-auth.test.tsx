import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OtpSignInPageClient, SignInDialog, SignInPageClient } from "@/components/sign-in-auth"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  useSession: vi.fn(),
  sendVerificationOtp: vi.fn(),
  signInEmailOtp: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: mocks.useSession,
    emailOtp: {
      sendVerificationOtp: mocks.sendVerificationOtp,
    },
    signIn: {
      emailOtp: mocks.signInEmailOtp,
    },
  },
}))

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

describe("SignInPageClient", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.useSession.mockReset()
    mocks.useSession.mockReturnValue({ data: null, refetch: mocks.refetch })
    mocks.sendVerificationOtp.mockReset()
    mocks.sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null })
    mocks.signInEmailOtp.mockReset()
    mocks.signInEmailOtp.mockResolvedValue({ data: { user: { email: "ada@example.com" } }, error: null })
    mocks.refetch.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  it("sends an email code and routes to the OTP page", async () => {
    const user = userEvent.setup()
    render(<SignInPageClient />)

    await user.type(screen.getByLabelText("Email"), "Ada@Example.com")
    await user.click(screen.getByRole("button", { name: "Send code" }))

    await waitFor(() =>
      expect(mocks.sendVerificationOtp).toHaveBeenCalledWith({
        email: "ada@example.com",
        type: "sign-in",
      }),
    )
    expect(mocks.push).toHaveBeenCalledWith("/en/sign-in/otp?email=ada%40example.com")
  })

  it("preserves a safe next path when routing to OTP", async () => {
    const user = userEvent.setup()
    render(<SignInPageClient nextPath="/settings#alerts" />)

    await user.type(screen.getByLabelText("Email"), "Ada@Example.com")
    await user.click(screen.getByRole("button", { name: "Send code" }))

    await waitFor(() => expect(mocks.push).toHaveBeenCalled())
    expect(mocks.push).toHaveBeenCalledWith("/en/sign-in/otp?email=ada%40example.com&next=%2Fen%2Fsettings%23alerts")
  })

  it("marks the email field as a code delivery address instead of a password login", () => {
    render(<SignInPageClient />)

    const emailInput = screen.getByLabelText("Email")
    const form = emailInput.closest("form")
    expect(form).toHaveAttribute("autocomplete", "off")
    expect(emailInput).toHaveAttribute("type", "email")
    expect(emailInput).toHaveAttribute("name", "email-code-address")
    expect(emailInput).toHaveAttribute("autocomplete", "off")
    expect(emailInput).toHaveAttribute("inputmode", "email")
    expect(emailInput).toHaveAttribute("autocapitalize", "none")
    expect(emailInput).toHaveAttribute("autocorrect", "off")
    expect(emailInput).toHaveAttribute("enterkeyhint", "send")
    expect(emailInput).toHaveAttribute("data-form-type", "other")
    expect(emailInput).toHaveAttribute("data-np-ignore", "true")
  })

  it("shows the legal terms below the email field", () => {
    render(<SignInPageClient />)

    const termsLink = screen.getByRole("link", { name: "Terms of Service" })
    expect(termsLink).toHaveAttribute("href", "/en/legal/terms")
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/en/legal/privacy")
    expect(termsLink.closest("p")).toHaveClass("mb-2")
  })

  it("centers the signed-in state", () => {
    mocks.useSession.mockReturnValue({ data: { user: { email: "ada@example.com" } }, refetch: mocks.refetch })

    render(<SignInPageClient nextPath="/settings" />)

    const settingsLink = screen.getByRole("link", { name: "Settings" })
    const heading = screen.getByRole("heading", { name: "Account" })

    expect(settingsLink).toHaveAttribute("href", "/en/settings")
    expect(settingsLink).toHaveClass("mx-auto", "w-fit")
    expect(settingsLink.closest("main")).toHaveClass("content-center", "text-center")
    expect(heading.parentElement).toHaveClass("justify-items-center")
  })

  it("starts a cooldown when the OTP endpoint is rate limited", async () => {
    const user = userEvent.setup()
    mocks.sendVerificationOtp.mockResolvedValue({ data: null, error: { status: 429, retryAfter: 42 } })
    render(<SignInPageClient />)

    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.click(screen.getByRole("button", { name: "Send code" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Wait 42s before requesting another code."))
    expect(screen.getByRole("button", { name: /Resend in/ })).toBeDisabled()
  })
})

describe("SignInDialog", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.useSession.mockReset()
    mocks.useSession.mockReturnValue({ data: null, refetch: mocks.refetch })
    mocks.sendVerificationOtp.mockReset()
    mocks.sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null })
    mocks.signInEmailOtp.mockReset()
    mocks.signInEmailOtp.mockResolvedValue({ data: { user: { email: "ada@example.com" } }, error: null })
    mocks.refetch.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  it("opens a modal OTP flow from the trigger and completes without routing", async () => {
    const user = userEvent.setup()
    const onCompleted = vi.fn()
    render(<SignInDialog onCompleted={onCompleted} />)

    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/en/legal/terms")
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/en/legal/privacy")

    await user.type(screen.getByLabelText("Email"), "Ada@Example.com")
    await user.click(screen.getByRole("button", { name: "Send code" }))

    await waitFor(() =>
      expect(mocks.sendVerificationOtp).toHaveBeenCalledWith({
        email: "ada@example.com",
        type: "sign-in",
      }),
    )
    expect(mocks.push).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeVisible()
    expect(screen.getByText("We sent a 6-digit code to ada@example.com.")).toBeVisible()
    expect(screen.getByRole("button", { name: /Resend in/ })).toBeDisabled()

    await user.type(screen.getByLabelText("Code 1"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify code" }))

    await waitFor(() =>
      expect(mocks.signInEmailOtp).toHaveBeenCalledWith({
        email: "ada@example.com",
        otp: "123456",
      }),
    )
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "You're signed in" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(onCompleted).toHaveBeenCalledTimes(1)
  })

  it("shows validation errors inside the modal", async () => {
    const user = userEvent.setup()
    render(<SignInDialog />)

    await user.click(screen.getByRole("button", { name: "Sign in" }))
    await user.type(screen.getByLabelText("Email"), "not-an-email")
    await user.click(screen.getByRole("button", { name: "Send code" }))

    expect(screen.getByText("Enter a valid email address.")).toBeVisible()
    expect(mocks.sendVerificationOtp).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText("Email"))
    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.click(screen.getByRole("button", { name: "Send code" }))
    await screen.findByRole("heading", { name: "Check your email" })

    await user.click(screen.getByRole("button", { name: "Verify code" }))
    expect(screen.getByText("Enter all 6 digits.")).toBeVisible()
    expect(mocks.signInEmailOtp).not.toHaveBeenCalled()

    mocks.signInEmailOtp.mockResolvedValueOnce({ data: null, error: { message: "INVALID_OTP" } })
    await user.type(screen.getByLabelText("Code 1"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify code" }))

    await waitFor(() => expect(screen.getByText("Invalid or expired code.")).toBeVisible())
  })
})

describe("OtpSignInPageClient", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.useSession.mockReset()
    mocks.useSession.mockReturnValue({ data: null, refetch: mocks.refetch })
    mocks.sendVerificationOtp.mockReset()
    mocks.sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null })
    mocks.signInEmailOtp.mockReset()
    mocks.signInEmailOtp.mockResolvedValue({ data: { user: { email: "ada@example.com" } }, error: null })
    mocks.refetch.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  it("verifies the code and routes to the timer homepage", async () => {
    const user = userEvent.setup()
    render(<OtpSignInPageClient email="ada@example.com" />)

    await user.type(screen.getByLabelText("Code 1"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify code" }))

    await waitFor(() =>
      expect(mocks.signInEmailOtp).toHaveBeenCalledWith({
        email: "ada@example.com",
        otp: "123456",
      }),
    )
    expect(mocks.refetch).toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith("/")
  })

  it("verifies the code and routes to a safe next path", async () => {
    const user = userEvent.setup()
    render(<OtpSignInPageClient email="ada@example.com" nextPath="/settings#alerts" />)

    await user.type(screen.getByLabelText("Code 1"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify code" }))

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/en/settings#alerts"))
  })

  it("lets a correct OTP sign in after an invalid code attempt", async () => {
    const user = userEvent.setup()
    mocks.signInEmailOtp
      .mockResolvedValueOnce({ data: null, error: { message: "INVALID_OTP" } })
      .mockResolvedValueOnce({ data: { user: { email: "ada@example.com" } }, error: null })
    render(<OtpSignInPageClient email="ada@example.com" />)

    const firstSlot = screen.getByLabelText("Code 1")
    await user.type(firstSlot, "123456")
    await user.click(screen.getByRole("button", { name: "Verify code" }))

    await waitFor(() => expect(screen.getByText("Invalid or expired code.")).toBeVisible())

    await user.click(firstSlot)
    await user.paste("654321")
    await user.click(screen.getByRole("button", { name: "Verify code" }))

    await waitFor(() =>
      expect(mocks.signInEmailOtp).toHaveBeenLastCalledWith({
        email: "ada@example.com",
        otp: "654321",
      }),
    )
    expect(mocks.refetch).toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith("/")
    expect(mocks.toastError.mock.calls.flat()).not.toContain("Wait 60s before requesting another code.")
  })

  it("marks the OTP input for one-time-code autofill", () => {
    render(<OtpSignInPageClient email="ada@example.com" />)

    const firstSlot = screen.getByLabelText("Code 1")
    expect(firstSlot).toHaveAttribute("autocomplete", "one-time-code")
    expect(firstSlot).toHaveAttribute("name", "one-time-code")
    expect(firstSlot).toHaveAttribute("inputmode", "numeric")
    expect(firstSlot).toHaveAttribute("autocapitalize", "none")
    expect(firstSlot).toHaveAttribute("autocorrect", "off")
  })

  it("resends a code from the OTP page after cooldown expires", async () => {
    const user = userEvent.setup()
    render(<OtpSignInPageClient email="ada@example.com" />)

    await user.click(screen.getByRole("button", { name: "Resend code" }))

    await waitFor(() =>
      expect(mocks.sendVerificationOtp).toHaveBeenCalledWith({ email: "ada@example.com", type: "sign-in" }),
    )
  })

  it("clears the code and validation status after resend succeeds", async () => {
    const user = userEvent.setup()
    mocks.signInEmailOtp.mockResolvedValueOnce({ data: null, error: { message: "INVALID_OTP" } })
    render(<OtpSignInPageClient email="ada@example.com" />)

    const firstSlot = screen.getByLabelText("Code 1")
    await user.type(firstSlot, "123456")
    await user.click(screen.getByRole("button", { name: "Verify code" }))

    await waitFor(() => expect(screen.getByText("Invalid or expired code.")).toBeVisible())
    expect(firstSlot).toHaveAttribute("aria-invalid", "true")

    await user.click(screen.getByRole("button", { name: "Resend code" }))

    await waitFor(() => expect(mocks.sendVerificationOtp).toHaveBeenCalled())
    expect(screen.queryByText("Invalid or expired code.")).not.toBeInTheDocument()
    for (let index = 1; index <= 6; index += 1) {
      expect(screen.getByLabelText(`Code ${index}`)).toHaveValue("")
      expect(screen.getByLabelText(`Code ${index}`)).toHaveAttribute("aria-invalid", "false")
    }
  })
})
