// Motion tokens for scripts (Web Animations, timeouts). The same values are CSS
// custom properties in app/globals.css (`--ease-move`, `--ease-fade`,
// `--transition-duration-*`), which Tailwind turns into `ease-move`,
// `ease-fade` and `duration-press|exit|enter|move`. A test keeps both in step.

/** Moves: things that change place or size. */
export const MOVE_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)"
/** Fades: opacity and blur. */
export const FADE_EASING = "cubic-bezier(0, 0, 0.2, 1)"

/** Durations in milliseconds. Exits are faster than entrances. */
export const MOTION_MS = {
  /** A press answering (scale 0.97). */
  press: 120,
  /** Something leaving. */
  exit: 160,
  /** Something arriving. */
  enter: 220,
  /** Something travelling across the layout (reorder, a bar closing). */
  move: 260,
} as const

/** Whether the person asked for reduced motion: keep fades, drop movement. */
export function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

/** Whether `element` can run a Web Animation (jsdom cannot). */
export function canAnimate(element: Element | null | undefined): element is Element {
  return Boolean(element) && typeof Element.prototype.animate === "function"
}

// Menus grow from their trigger (the content's transform origin follows it);
// they open in 220 ms on the move curve and close in 160 ms.
export const MENU_MOTION_CLASSNAME =
  "data-[state=open]:duration-enter data-[state=closed]:duration-exit data-[state=open]:ease-move data-[state=closed]:ease-fade motion-reduce:data-[side=bottom]:slide-in-from-top-0 motion-reduce:data-[side=top]:slide-in-from-bottom-0 motion-reduce:zoom-in-100 motion-reduce:zoom-out-100"

/**
 * A card that opens its detail view answers a press on itself (not on its own controls,
 * which stack above the opener): scale 0.97 in 120 ms. Reduced motion keeps it still.
 */
export const CARD_PRESS_CLASSNAME =
  "transition-[scale,background-color,border-color] duration-press ease-move has-[[data-timer-detail-opener]:active]:scale-[0.97] motion-reduce:has-[[data-timer-detail-opener]:active]:scale-100"

/**
 * A control that answers a press (scale 0.97 in 120 ms). The element's own
 * transition must include `scale`: `Button` animates everything; other elements
 * use `transition-transform` or list `scale`. Reduced motion keeps it still.
 */
export const PRESS_CLASSNAME = "duration-press active:scale-[0.97] motion-reduce:active:scale-100"
