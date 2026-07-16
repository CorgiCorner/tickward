import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()

  Object.defineProperties(Element.prototype, {
    hasPointerCapture: {
      configurable: true,
      writable: true,
      value: vi.fn(() => false),
    },
    releasePointerCapture: {
      configurable: true,
      writable: true,
      value: vi.fn(),
    },
    scrollIntoView: {
      configurable: true,
      writable: true,
      value: vi.fn(),
    },
    setPointerCapture: {
      configurable: true,
      writable: true,
      value: vi.fn(),
    },
  })

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      controller: null,
      register: vi.fn().mockResolvedValue(undefined),
      ready: Promise.resolve({ active: { postMessage: vi.fn() } }),
    },
  })

  class ResizeObserverMock {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }

  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverMock,
  })

  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  })

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:tickward-test"),
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  document.title = ""
  document.body.innerHTML = ""
})
