/**
 * KIT CONSTANTS — the non-component half of the component kit.
 *
 * These live outside kit.jsx for one concrete reason: React Fast Refresh only
 * works when a module exports components and nothing else. A file that exports
 * both `Button` and `cx` loses hot-reload for every component in it, which is
 * exactly what `react-refresh/only-export-components` is warning about. Block 2
 * introduced that mix; this file undoes it.
 *
 * Nothing here renders. Nothing here reads or writes data. These are the class
 * strings and the one join helper that kit.jsx and the screens share.
 *
 * The values are unchanged from the versions that lived in kit.jsx — this was a
 * move, not a redesign.
 */

/** Join class fragments, dropping the falsy ones. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

/* ─── Form controls ───────────────────────────────────────────────────────
   The one input look: white ground, hairline border, 10px radius, teal focus
   ring. Every Inp / Txt / Sel in the app resolves to this. */
export const fieldCls =
  'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-400 ' +
  'wl-transition hover:border-gray-400 focus:border-teal focus:ring-2 focus:ring-teal/25 ' +
  'disabled:bg-gray-50 disabled:text-ink-soft disabled:hover:border-gray-300'

/**
 * U-05 — the styled select.
 *
 * NOTE: this carries `appearance-none`, so it removes the browser's own
 * dropdown arrow. It is only correct on a <select> wrapped by the kit's <Sel>,
 * which draws the chevron back. Do not put this class on a bare <select> — you
 * get a dropdown with no visible affordance at all. Use <Sel>.
 */
export const selectCls = cx(fieldCls, 'appearance-none pr-9 cursor-pointer')

/* ─── Badge tones ─────────────────────────────────────────────────────────
   green / amber / red carry STATUS and nothing else. `brand` is teal — active,
   not a health judgement. `neutral` and `quiet` are states with no verdict. */
export const BADGE_TONES = {
  ok:      'bg-ok-bg text-green-700',
  warn:    'bg-warn-bg text-amber-700',
  alert:   'bg-alert-bg text-red-700',
  brand:   'bg-teal-tint text-teal-deep',
  neutral: 'bg-gray-100 text-gray-600',
  quiet:   'bg-gray-100 text-gray-400',
}
