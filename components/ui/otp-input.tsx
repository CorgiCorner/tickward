import * as React from "react"

import { cn } from "@/lib/utils"

function onlyDigits(value: string) {
  return value.replaceAll(/\D/g, "")
}

function focusSlot(input: HTMLInputElement, index: number) {
  const root = input.closest("[data-otp-root]")
  const slots = root?.querySelectorAll<HTMLInputElement>("input[data-otp-slot]")
  slots?.[index]?.focus()
  slots?.[index]?.select()
}

export function OtpInput({
  ariaDescribedBy,
  ariaInvalid,
  className,
  disabled,
  id,
  label,
  length = 6,
  onChange,
  value,
}: Readonly<{
  ariaDescribedBy?: string
  ariaInvalid?: boolean
  className?: string
  disabled?: boolean
  id?: string
  label: string
  length?: number
  onChange: (value: string) => void
  value: string
}>) {
  const normalizedValue = onlyDigits(value).slice(0, length)

  function updateSlot(index: number, nextInputValue: string, input: HTMLInputElement) {
    const digits = onlyDigits(nextInputValue)
    if (digits.length > 1) {
      const prefix = normalizedValue.slice(0, index)
      const suffix = normalizedValue.slice(index + digits.length)
      const nextValue = `${prefix}${digits}${suffix}`.slice(0, length)
      onChange(nextValue)
      focusSlot(input, Math.min(nextValue.length, length - 1))
      return
    }

    const chars = normalizedValue.padEnd(length, " ").split("")
    chars[index] = digits
    const nextValue = chars.join("").replaceAll(" ", "").slice(0, length)
    onChange(nextValue)
    if (digits && index < length - 1) focusSlot(input, index + 1)
  }

  return (
    <div
      data-otp-root
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          id={index === 0 ? id : undefined}
          data-otp-slot
          aria-describedby={index === 0 ? ariaDescribedBy : undefined}
          aria-invalid={ariaInvalid}
          aria-label={`${label} ${index + 1}`}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoCorrect="off"
          autoCapitalize="none"
          className={cn(
            "border-input bg-background text-foreground h-12 min-w-0 rounded-lg border text-center text-lg font-semibold tabular-nums shadow-xs outline-none transition-[color,box-shadow,border-color]",
            "selection:bg-primary selection:text-primary-foreground",
            normalizedValue[index] && "border-foreground/30",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          )}
          disabled={disabled}
          enterKeyHint={index === length - 1 ? "done" : "next"}
          inputMode="numeric"
          maxLength={index === 0 ? length : 1}
          name={index === 0 ? "one-time-code" : undefined}
          pattern="[0-9]*"
          spellCheck={false}
          value={normalizedValue[index] ?? ""}
          onChange={(event) => updateSlot(index, event.target.value, event.currentTarget)}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !normalizedValue[index] && index > 0) {
              event.preventDefault()
              const chars = normalizedValue.padEnd(length, " ").split("")
              chars[index - 1] = ""
              onChange(chars.join("").replaceAll(" ", "").slice(0, length))
              focusSlot(event.currentTarget, index - 1)
            }
            if (event.key === "ArrowLeft" && index > 0) {
              event.preventDefault()
              focusSlot(event.currentTarget, index - 1)
            }
            if (event.key === "ArrowRight" && index < length - 1) {
              event.preventDefault()
              focusSlot(event.currentTarget, index + 1)
            }
          }}
          onPaste={(event) => {
            event.preventDefault()
            updateSlot(index, event.clipboardData.getData("text"), event.currentTarget)
          }}
        />
      ))}
    </div>
  )
}
