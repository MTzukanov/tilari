import {
  viaHighlightAccount,
  voucherHash,
  voucherParentHash,
  voucherUpI18n,
} from '../../app/routing'
import type { ModuleNavItem } from '../nav'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { VoucherEditor } from './ui/VoucherEditor'
import { VoucherListView } from './ui/VoucherListView'
import { VoucherView } from './ui/VoucherView'

function VouchersScreen({ route, meta, goTo, t }: BookViewCtx) {
  if (route.view === 'voucher' && meta) {
    const up = voucherUpI18n(route.via)
    return (
      <VoucherView
        voucherId={route.voucherId}
        highlightAccount={viaHighlightAccount(route.via)}
        highlightEntryId={route.entryId}
        upLabel={t(up.key, up.vars)}
        editHref={voucherHash(route.via, route.voucherId, route.entryId, true)}
        onBack={() => goTo(voucherParentHash(route.via))}
        onOpenAccount={(account) => goTo(`#/account/${account}`)}
      />
    )
  }
  if (route.view === 'edit' && meta) {
    return (
      <VoucherEditor
        voucherId={route.voucherId}
        defaultType={route.type}
        defaultDate={meta.book_date}
        copyFromId={route.copyFromId}
        onCancel={() => {
          if (route.voucherId != null) {
            goTo(voucherHash(route.via, route.voucherId, route.entryId))
            return
          }
          goTo('#/browse')
        }}
        onSaved={(id, opts) => goTo(voucherHash(route.via, id, null, Boolean(opts?.stay)))}
        onOpenVoucher={(id) => goTo(voucherHash(route.via, id, null, true))}
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
  match: (route) =>
    route.view === 'browse' || route.view === 'voucher' || route.view === 'edit',
  Screen: VouchersScreen,
  activeNav: (route) => {
    if (route.view === 'browse') return 'browse'
    if (route.view === 'edit' && route.voucherId == null) return 'newVoucher'
    if (viaKind(route) === 'browse') return 'browse'
    return null
  },
}
