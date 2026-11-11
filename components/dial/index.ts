// The dial view of the dashboard. Render `DialDashboard` with the app's timers; everything
// else here is for hosts that need a piece of it (focus mode, the dial alone) or for tests.

export { DialDashboard, dialTimerColor, type DialDashboardProps } from "./dial-dashboard"
export {
  appDialClock,
  DialClockProvider,
  fixedDialClock,
  offsetDialClock,
  useDialNow,
  type DialClock,
} from "./dial-clock"
export { DialFace, type DialFaceProps, type DialMomentPhase } from "./dial-face"
export { DialFocusMode, type DialFocusModeProps } from "./dial-focus-mode"
export {
  DIAL_SECTION_ORDER,
  DIAL_TICK_COUNT,
  defaultDialSelection,
  dialScale,
  dialSections,
  dialTimerView,
  type DialScale,
  type DialScaleUnit,
  type DialSection,
  type DialSectionId,
  type DialTimerPhase,
  type DialTimerView,
} from "./dial-model"
export {
  createLocalMomentLedger,
  createMemoryMomentLedger,
  localMomentLedger,
  type DialMomentLedger,
} from "./milestone-moment"
export { TickDial, type TickDialProps } from "./tick-dial"
