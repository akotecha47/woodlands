import { useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * The module page's active tab, honouring a tab requested by navigation.
 *
 * The top bar's jump-to-section box navigates with `state: { tab }` so a search
 * hit can land on Farmers Market › Businesses rather than on Farmers Market and
 * whatever tab it happens to open on.
 *
 * Two details that are easy to get wrong:
 *
 *  1. It syncs DURING RENDER, not in an effect. Deriving state from a changed
 *     input is the React-sanctioned pattern for exactly this; an effect would
 *     paint the wrong tab first and then correct it, which is a visible flash on
 *     a heavy tab.
 *  2. It keys on `location.key`, not on the tab value. Jumping to the SAME tab
 *     twice is a real thing a person does after clicking away, and keying on the
 *     value would make the second jump a no-op.
 *
 * The user's own clicks always win afterwards: `setTab` is plain state, and
 * nothing re-applies the navigation tab until the next navigation.
 */
export function useSectionTab(defaultTab) {
  const location = useLocation()
  const navTab = location.state?.tab ?? null

  const [tab, setTab] = useState(navTab ?? defaultTab)
  const [seenKey, setSeenKey] = useState(location.key)

  if (location.key !== seenKey) {
    setSeenKey(location.key)
    if (navTab && navTab !== tab) setTab(navTab)
  }

  return [tab, setTab]
}
