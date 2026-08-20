/**
 * THE COMPONENT KIT — one canonical version of each control.
 *
 * Block 2 ("The Look"), 20 August 2026. Everything visual in the app should
 * come from here or from the tokens in src/index.css. If a screen needs a
 * button, a card, a table header, a form row, a badge or an empty state, it
 * takes it from this file rather than hand-rolling one — that is the whole
 * point: the app should look like one product, not six.
 *
 * PRESENTATION ONLY. Nothing in this file reads or writes data, and no
 * component here changes what its caller loads or submits.
 *
 * Adoption note: src/components/admin/AdminUI.jsx re-exports Field / Inp / Sel
 * / Th / Td / Toast from here, and every module's own *UI.jsx delegates its
 * badges and empty rows here too. That is how ~37 screens inherit the kit
 * without each being rewritten.
 *
 * THIS FILE EXPORTS COMPONENTS AND NOTHING ELSE. Class strings and helpers
 * live in ./kit.constants.js, the toast hook in ./useFlash.js — a module that
 * mixes the two loses Fast Refresh for every component in it.
 */

import { ChevronDown, Inbox, ShieldAlert, Search, X } from 'lucide-react'
import { cx, fieldCls, selectCls, BADGE_TONES } from './kit.constants'

/* ═══════════════════════════════════════════════════════════════════════════
   BUTTON — three looks. Primary is teal, secondary is white-on-line, danger
   is alert. There is no fourth.
   ═════════════════════════════════════════════════════════════════════════ */

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg wl-transition ' +
  'disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap'

const BTN_VARIANTS = {
  primary:   'bg-teal text-white hover:bg-teal-deep shadow-sm hover:shadow-md',
  secondary: 'bg-white text-gray-700 border border-line hover:bg-gray-50 hover:border-gray-300',
  danger:    'bg-alert text-white hover:bg-red-700 shadow-sm',
  // Quiet tertiary — a text action inside a dense row. Still a real button.
  ghost:     'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
  // An action link in a card header, always teal.
  link:      'text-teal hover:text-teal-deep font-semibold',
}

const BTN_SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

export function Button({
  variant = 'primary', size = 'md', className = '', type = 'button', ...props
}) {
  return (
    <button
      type={type}
      className={cx(BTN_BASE, BTN_VARIANTS[variant] ?? BTN_VARIANTS.primary, BTN_SIZES[size], className)}
      {...props}
    />
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CARD / PANEL — white, hairline border, 16px radius, the standard shadow.
   ═════════════════════════════════════════════════════════════════════════ */

export function Card({ className = '', children, ...props }) {
  return (
    <section
      className={cx('bg-white border border-line rounded-xl shadow-card', className)}
      {...props}
    >
      {children}
    </section>
  )
}

/** Title left, optional teal action right. One header shape, used everywhere. */
export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={cx('px-5 py-4 border-b border-line flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold text-navy leading-snug">{title}</h2>
        {subtitle && <p className="text-xs text-ink-soft mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className = '', children }) {
  return <div className={cx('p-5', className)}>{children}</div>
}

/** A section heading used outside a Card — same weight and colour as CardHeader. */
export function SectionHead({ title, subtitle, action, className = '' }) {
  return (
    <div className={cx('flex items-end justify-between gap-4 flex-wrap', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold text-navy">{title}</h2>
        {subtitle && <p className="text-xs text-ink-soft mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TABLE — one header treatment, one row rhythm, hairline dividers. Every data
   table in the app runs through these.
   ═════════════════════════════════════════════════════════════════════════ */

/** Rounded, bordered, horizontally scrollable frame. Wide tables scroll
 *  INSIDE this, so the page body never scrolls sideways. */
export function TableWrap({ className = '', children }) {
  return (
    <div className={cx('wl-scroll-x border border-line rounded-xl bg-white', className)}>
      {children}
    </div>
  )
}

export function Th({ children, className = '', ...props }) {
  return (
    <th
      className={cx(
        'text-left px-4 py-3 text-[11px] font-bold text-ink-soft uppercase tracking-[.06em] whitespace-nowrap',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '', ...props }) {
  return (
    <td className={cx('px-4 py-3 text-sm text-gray-600 align-middle', className)} {...props}>
      {children ?? '—'}
    </td>
  )
}

/** The identity column — the one cell in a row that names the thing. */
export function TdBold({ children, className = '', ...props }) {
  return (
    <td className={cx('px-4 py-3 text-sm font-semibold text-navy align-middle', className)} {...props}>
      {children ?? '—'}
    </td>
  )
}

export function Thead({ children }) {
  return <thead className="bg-gray-50 border-b border-line">{children}</thead>
}

/** The in-table empty row. Says what belongs here, never just "none". */
export function EmptyRow({ cols, msg = 'Nothing here yet.' }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-sm text-ink-soft">
        {msg}
      </td>
    </tr>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORM FIELDS
   ─────────────────────────────────────────────────────────────────────────
   U-05: the select is styled to match the inputs — the raw browser control is
   the loudest "assembled" tell on a form. appearance-none plus our own chevron.
   `fieldCls` and `selectCls` are in ./kit.constants.js.
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * One form row. `span="full"` makes it run the whole width of a FormGrid —
 * for notes, textareas and anything that reads badly at half width.
 */
export function Field({ label, hint, error, span, htmlFor, className = '', children }) {
  return (
    <div className={cx(span === 'full' && 'md:col-span-2', 'min-w-0', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-[12.5px] font-semibold text-ink-soft mb-1.5"
        >
          {label}
        </label>
      )}
      {children}
      {hint  && !error && <p className="mt-1.5 text-xs text-ink-soft leading-relaxed">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-alert font-medium">{error}</p>}
    </div>
  )
}

export function Inp({ className = '', ...props }) {
  return <input className={cx(fieldCls, className)} {...props} />
}

export function Txt({ className = '', rows = 3, ...props }) {
  return <textarea rows={rows} className={cx(fieldCls, 'resize-y', className)} {...props} />
}

/**
 * U-05 — the one styled select. Chevron is ours; the control is native.
 *
 * The select is `w-full` and the wrapper is what sizes it. Inside a <Field> in
 * a FormGrid the grid cell already does that, so nothing is needed. In a
 * flex filter bar there is no cell, so pass `wrapClassName="w-44"` (or
 * whatever the row wants) — otherwise the control has no width to fill.
 */
export function Sel({ children, className = '', wrapClassName = '', ...props }) {
  return (
    <div className={cx('relative', wrapClassName)}>
      <select className={cx(selectCls, className)} {...props}>{children}</select>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  )
}

/**
 * U-04 — the landscape form. Two columns on desktop, one on tablet and below.
 * This is what replaces the phone-portrait column stranded in empty space.
 *
 * `cols` is the ladder, not a raw column count — one entry per shape a form in
 * this app actually needs, so no screen hand-writes its own grid classes:
 *   2 — the default form row (a label-and-value pair per line)
 *   3 — a short triplet (date / time / time, or name / phone / email)
 *   5 — the inline "add a reference row" strip (Rooms)
 * Every ladder starts at one column, so nothing is ever squeezed on a phone.
 * Tailwind needs literal class names, so these are spelled out rather than
 * interpolated.
 *
 * Note `<Field span="full">` spans two columns, which is the 2-col shape. In a
 * 3- or 5-col grid, size the field with a className instead.
 */
const FORM_GRID_COLS = {
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
}

export function FormGrid({ cols = 2, className = '', children }) {
  return (
    <div className={cx('grid gap-x-6 gap-y-4', FORM_GRID_COLS[cols] ?? FORM_GRID_COLS[2], className)}>
      {children}
    </div>
  )
}

/** The action row at the foot of a form — hairline above, buttons left. */
export function FormActions({ className = '', children }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-3 pt-5 mt-6 border-t border-line', className)}>
      {children}
    </div>
  )
}

/**
 * U-04 — a full form screen.
 *
 * The one shape every "add / log / record" screen uses, so none of them is its
 * own margin. Deliberately NOT a Card: these render inside the page's own card
 * frame, and a card in a card is the doubled border that made the old forms
 * look assembled.
 *
 * `maxW` is a real decision, not a default. A phone-portrait column stranded
 * in a wide frame is what U-04 reported; a form stretched edge to edge across
 * 1400px is no better. max-w-4xl in two columns fills the frame and still has
 * a margin.
 */
export function FormPanel({
  title, subtitle, onSubmit, maxW = 'max-w-4xl', className = '', children,
}) {
  return (
    <div className={cx('p-6', className)}>
      {title && <SectionHead title={title} subtitle={subtitle} className="mb-6" />}
      <form onSubmit={onSubmit} className={maxW}>{children}</form>
    </div>
  )
}

/** A labelled search box. Display/filter only — never changes what loads. */
export function SearchInput({ value, onChange, placeholder = 'Search…', className = '', ...props }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cx(fieldCls, 'pl-9', value ? 'pr-9' : '')}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange({ target: { value: '' } })}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 wl-transition"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS BADGE — the ok / warn / alert treatment. `brand` is teal (active,
   not a health judgement); `neutral` is grey (a state with no verdict).
   The tone table itself is in ./kit.constants.js.
   ═════════════════════════════════════════════════════════════════════════ */

export function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap',
        BADGE_TONES[tone] ?? BADGE_TONES.neutral,
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMPTY STATE — an icon, a plain sentence saying what belongs here and what
   to do about it. Never a blank.
   ═════════════════════════════════════════════════════════════════════════ */

export function EmptyState({ Icon = Inbox, title, body, action, className = '' }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center px-6 py-14', className)}>
      <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
        <Icon size={19} className="text-gray-400" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-navy">{title}</p>
      {body && <p className="text-sm text-ink-soft mt-1.5 max-w-sm leading-relaxed">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** The role gate. Same shape as an empty state, alert-toned. */
export function AccessDenied({ what = 'this section' }) {
  return (
    <div className="p-6">
      <div className="flex items-start gap-3 bg-alert-bg border border-red-200 rounded-xl p-4">
        <ShieldAlert size={18} className="text-alert shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-red-800">Access denied</p>
          <p className="text-sm text-red-700 mt-0.5">
            Your role does not have permission to use {what}.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TABS — U-06. One tab bar. Events, Inventory, Farmers Market, Table Bookings
   and Admin all had their own near-copy; this is the only one now.
   ═════════════════════════════════════════════════════════════════════════ */

export function Tabs({ tabs, value, onChange, size = 'md', ariaLabel = 'Sections' }) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="wl-scroll-x flex gap-1 bg-gray-100 p-1 rounded-xl w-fit max-w-full"
    >
      {tabs.map(t => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cx(
              pad,
              'rounded-lg font-semibold whitespace-nowrap wl-transition',
              active
                ? 'bg-white text-navy shadow-sm'
                : 'text-ink-soft hover:text-navy hover:bg-white/60',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE HEADER — the eyebrow + title block every module page opens with.
   ═════════════════════════════════════════════════════════════════════════ */

export function PageHeader({ eyebrow, title, subtitle, action, className = '' }) {
  return (
    <div className={cx('flex items-end justify-between gap-6 flex-wrap', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-teal mb-1.5">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[27px] font-bold text-navy tracking-[-.02em] leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-soft mt-1.5 max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAT TREATMENT
   ─────────────────────────────────────────────────────────────────────────
   StatBand is the DASHBOARD's signature: one connected bordered band of hero
   numbers. It is deliberately NOT bolted onto other screens — a delivery form
   does not get hero numbers. Where another screen has a genuine summary
   (FM Businesses, Table Bookings status counts, Payments totals) it uses
   StatTiles instead: the same character at a calmer size.
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * The connected band. Children are StatCells.
 *
 * The hairlines between cells are the grid's own `gap-px` over a --line
 * background, not per-cell borders: with a responsive column count the cells
 * rewrap, and border-on-child rules draw lines in the wrong places the moment
 * they do. A gap draws exactly one hairline between any two neighbours at
 * every breakpoint.
 */
export function StatBand({ className = '', children }) {
  return (
    <div
      className={cx(
        'grid grid-cols-1 sm:grid-cols-2 gap-px bg-line',
        'rounded-2xl border border-line shadow-card overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * One cell of the hero band. Clickable cells lift and reveal their arrow.
 * `onClick` is navigation only — no cell reads or writes anything.
 */
export function StatCell({ Icon, label, value, valueCls = 'text-[46px]', foot, onClick, ariaLabel, ChevronIcon }) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={14} className="text-teal shrink-0" aria-hidden="true" />}
        <p className="text-[11px] font-bold uppercase tracking-[.09em] text-ink-soft">{label}</p>
        {onClick && ChevronIcon && (
          <ChevronIcon
            size={15}
            aria-hidden="true"
            className="ml-auto text-gray-300 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 wl-transition"
          />
        )}
      </div>
      <p className={cx(valueCls, 'font-extrabold text-navy tracking-[-.035em] leading-none tnum')}>
        {value}
      </p>
      {foot && <div className="mt-3">{foot}</div>}
    </>
  )

  const base = 'relative text-left p-6 bg-white'

  if (!onClick) return <div className={base}>{body}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={cx(base, 'group w-full cursor-pointer wl-transition hover:bg-gray-50')}
    >
      {body}
    </button>
  )
}

/** The calmer summary tile used outside the dashboard. */
export function StatTile({ label, value, foot, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-white border-line',
    ok:      'bg-ok-bg border-green-200',
    warn:    'bg-warn-bg border-amber-200',
    alert:   'bg-alert-bg border-red-200',
    brand:   'bg-teal-tint border-blue-200',
  }
  const valueTone = {
    neutral: 'text-navy', ok: 'text-green-700', warn: 'text-amber-700',
    alert: 'text-red-700', brand: 'text-teal-deep',
  }
  return (
    <div className={cx('rounded-xl border p-4', tones[tone] ?? tones.neutral, className)}>
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-ink-soft">{label}</p>
      <p className={cx('text-[26px] font-extrabold tracking-[-.03em] leading-none mt-2 tnum', valueTone[tone] ?? valueTone.neutral)}>
        {value}
      </p>
      {foot && <div className="mt-2 text-xs text-ink-soft">{foot}</div>}
    </div>
  )
}

/** A row of StatTiles. */
export function StatRow({ cols = 4, className = '', children }) {
  const colCls = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-5',
  }[cols] ?? 'sm:grid-cols-2 lg:grid-cols-4'
  return <div className={cx('grid grid-cols-1 gap-4', colCls, className)}>{children}</div>
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST
   ═════════════════════════════════════════════════════════════════════════ */

export function Toast({ toast }) {
  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold text-white max-w-sm',
        toast.ok ? 'bg-ok' : 'bg-alert',
      )}
    >
      {toast.msg}
    </div>
  )
}

/* `useFlash`, the hook that raises a Toast, is in ./useFlash.js. */

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL CHROME — the dialogs were each slightly different; this is the shape.
   ═════════════════════════════════════════════════════════════════════════ */

export function ModalShell({ size = 'md', className = '', children }) {
  const sizes = {
    sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl',
  }
  return (
    <div
      className={cx(
        'bg-white rounded-xl shadow-2xl border border-line w-full mx-4 max-h-[90vh] overflow-y-auto',
        sizes[size] ?? sizes.md,
        className,
      )}
    >
      {children}
    </div>
  )
}
