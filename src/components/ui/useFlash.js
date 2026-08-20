/**
 * useFlash — the toast helper the whole app raises messages through.
 *
 * Pair it with the kit's <Toast toast={toast} />:
 *
 *   const [toast, setToast] = useState(null)
 *   const flash = useFlash(setToast)
 *   flash('Saved', true)
 *
 * It lives in its own module rather than in kit.jsx because kit.jsx must export
 * components and nothing else for Fast Refresh to work — see kit.constants.js
 * for the same reasoning. The implementation is byte-for-byte the one that was
 * in kit.jsx: same 3.5s dismiss, same { msg, ok } shape.
 */
export function useFlash(setToast) {
  return function flash(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }
}
