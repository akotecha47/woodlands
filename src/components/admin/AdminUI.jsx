/**
 * Admin module helpers — and, historically, the de-facto shared UI file: 37
 * screens across all six modules import Field / Inp / Sel / Th / Td / Toast /
 * fieldCls from here.
 *
 * Block 2 turned that accident into the adoption path. These are now thin
 * re-exports of the canonical kit in src/components/ui/kit.jsx, so every one of
 * those 37 screens picked up the locked palette, the landscape form row and the
 * styled select without being individually rewritten.
 *
 * New code should import from '../ui/kit' directly. This file stays as the
 * compatibility seam, not as a second source of truth.
 *
 * WHAT IT DOES NOT RE-EXPORT: `fieldCls`, `useFlash` and `cx` are not
 * components, and a module that mixes components with plain values loses Fast
 * Refresh for all of them. Take those from '../ui/kit.constants' and
 * '../ui/useFlash' directly — they are one import line either way.
 */

export {
  Field,
  Inp,
  Sel,
  Txt,
  Th,
  Td,
  TdBold,
  Thead,
  Toast,
  Button,
  Card,
  CardHeader,
  CardBody,
  SectionHead,
  TableWrap,
  EmptyRow,
  EmptyState,
  Badge,
  Tabs,
  PageHeader,
  FormGrid,
  FormPanel,
  FormActions,
  SearchInput,
  StatRow,
  StatTile,
  ModalShell,
} from '../ui/kit'

export function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
