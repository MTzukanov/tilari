import { voucherHash, voucherParentHash } from '../../app/routing'
import type { ModuleNavItem } from '../nav'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { VoucherEditor } from './ui/VoucherEditor'
import { VoucherListView } from './ui/VoucherListView'

function VouchersScreen({ route, meta, goTo }: BookViewCtx) {
  if (route.view === 'edit' && meta) {
    return (
      <VoucherEditor
        voucherId={route.voucherId}
        defaultType={route.type}
        defaultDate={meta.book_date}
        copyFromId={route.copyFromId}
        onCancel={() => goTo(voucherParentHash(route.via))}
        onSaved={(id) => goTo(voucherHash(route.via, id, null))}
        onOpenVoucher={(id, opts) => {
          if (opts?.fromStatementId != null) {
            goTo(voucherHash({ kind: 'bankStatement', voucherId: opts.fromStatementId }, id, null))
            return
          }
          goTo(voucherHash(route.via, id, null))
        }}
        onCopyAsNew={(type, fromId) => goTo(`#/voucher/new/${type}/from/${fromId}`)}
      />
    )
  }
  if (route.view === 'browse' && meta) {
    return (
      <VoucherListView
        periods={meta.periods}
        onOpen={(id, entryId) => goTo(voucherHash({ kind: 'browse' }, id, entryId ?? null))}
      />
    )
  }
  return null
}

export const navItems: ModuleNavItem[] = [
  { id: 'newVoucher', href: '#/voucher/new/100', icon: 'plus', labelKey: 'nav.new' },
  { id: 'browse', href: '#/browse', icon: 'book', labelKey: 'nav.browse' },
]

export const vouchersUi: UiModule = {
  id: 'vouchers',
  navItems,
  match: (route) => route.view === 'browse' || route.view === 'edit',
  Screen: VouchersScreen,
  activeNav: (route) => {
    if (route.view === 'browse') return 'browse'
    if (route.view === 'edit' && route.voucherId == null) return 'newVoucher'
    if (viaKind(route) === 'browse' || viaKind(route) === 'bankStatement') return 'browse'
    return null
  },
}
