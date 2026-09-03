import type { PaymentMethod } from '../../../book/paymentMethods'
import { ALL_COUNTER_ACCOUNTS } from '../../../book/paymentMethods'
import { IconSelect } from './IconSelect'

const PAY_GLYPH: Record<string, string> = {
  kateinen: 'M4.8 9.2h14.4v6.8H4.8V9.2zm2.2 2v1.2h4.4V11.2H7zm8.4 1.2a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z',
  lasku: 'M7 3.8h10A1.6 1.6 0 0 1 18.6 5.4v15l-2.8-1.2-2.8 1.4-2.8-1.4-3.2 1.2V5.4A1.6 1.6 0 0 1 8.6 3.8H7zm2.2 3.4v1.6h6.6V7.2H9.2z',
  pankki: 'M4.6 9.2 12 4.8l7.4 4.4v1.4H4.6V9.2zm1.6 3.2h2.4v5.2H6.2v-5.2zm4.3 0h3v5.2h-3v-5.2zm5.3 0h2.4v5.2h-2.4v-5.2zM4.6 18.2h14.8v1.6H4.6v-1.6z',
  pankkikortti: 'M4.4 7.2h15.2A1.4 1.4 0 0 1 21 8.6v8.8A1.4 1.4 0 0 1 19.6 18.8H4.4A1.4 1.4 0 0 1 3 17.4V8.6A1.4 1.4 0 0 1 4.4 7.2zm0 2.2v1.8H21V9.4H4.4z',
  luottokortti: 'M4.4 7.2h15.2A1.4 1.4 0 0 1 21 8.6v8.8A1.4 1.4 0 0 1 19.6 18.8H4.4A1.4 1.4 0 0 1 3 17.4V8.6A1.4 1.4 0 0 1 4.4 7.2zm1.8 6.6v1.8h4.6v-1.8H6.2z',
  poista: 'M5 11.1h14v2.4H5z',
  siirra: 'M7 8h9.2l-2-2 1.5-1.5L20 9.8l-4.3 5.3-1.5-1.5 2-2H7V8zm10 8H7.8l2 2-1.5 1.5L4 14.2l4.3-5.3 1.5 1.5-2 2H17v3.6z',
  yksityis:
    'M12 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-5.4 14v-1.2c0-2.4 2.4-3.8 5.4-3.8s5.4 1.4 5.4 3.8V19H6.6z',
}

function PayIcon({ name }: { name: string }) {
  const d = PAY_GLYPH[name] || PAY_GLYPH.pankki
  return (
    <span className={`pay-icon pay-icon-${name || 'generic'}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="voucher-type-glyph">
        <path fill="currentColor" d={d} />
      </svg>
    </span>
  )
}

export function PaymentSelect({
  methods,
  value,
  allLabel,
  onChange,
}: {
  methods: PaymentMethod[]
  value: string
  allLabel: string
  onChange: (value: string, account: string) => void
}) {
  const options = [
    ...methods.map((m, i) => ({
      value: String(i),
      label: m.name,
      icon: <PayIcon name={m.icon} />,
      account: m.account ? String(m.account) : '',
    })),
    {
      value: ALL_COUNTER_ACCOUNTS,
      label: allLabel,
      icon: <PayIcon name="" />,
      account: '',
    },
  ]
  return (
    <IconSelect
      value={value}
      onChange={(next) => {
        const opt = options.find((o) => o.value === next)
        onChange(next, opt?.account ?? '')
      }}
      options={options}
    />
  )
}
