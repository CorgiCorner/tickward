import { afterEach, describe, expect, it } from "vitest"

import {
  DASHBOARD_VIEW_STORAGE_KEY,
  DEFAULT_DASHBOARD_VIEW,
  readCardsDashboardView,
  readDashboardView,
  writeDashboardView,
} from "@/components/dashboard/dashboard-view"

describe("dashboard view preference", () => {
  afterEach(() => localStorage.clear())

  it("defaults to the grid", () => {
    expect(DEFAULT_DASHBOARD_VIEW).toBe("grid")
    expect(readDashboardView()).toBe("grid")
  })

  it("keeps the choice on this device", () => {
    writeDashboardView("dial")
    expect(localStorage.getItem(DASHBOARD_VIEW_STORAGE_KEY)).toBe("dial")
    expect(readDashboardView()).toBe("dial")
  })

  it("remembers the last grid or list choice while the dial is on", () => {
    expect(readCardsDashboardView()).toBe("grid")
    writeDashboardView("list")
    writeDashboardView("dial")
    expect(readCardsDashboardView()).toBe("list")
    writeDashboardView("grid")
    expect(readCardsDashboardView()).toBe("grid")
  })

  it("keeps a list stored before the cards key existed when the dial is turned on", () => {
    localStorage.setItem(DASHBOARD_VIEW_STORAGE_KEY, "list")
    writeDashboardView("dial")
    expect(readCardsDashboardView()).toBe("list")
  })

  it("ignores unknown stored values", () => {
    localStorage.setItem(DASHBOARD_VIEW_STORAGE_KEY, "carousel")
    expect(readDashboardView()).toBe("grid")
  })
})
