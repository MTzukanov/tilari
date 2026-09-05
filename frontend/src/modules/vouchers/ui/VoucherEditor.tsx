import { useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteVoucher,
  fetchAccounts,
  fetchAllocations,
  fetchBankStatementOverlay,
  fetchPartners,
  fetchSettings,
  fetchVoucher,
  fetchVouchers,
  saveVoucher,
  splitBankStatement,
  uploadAttachment,
  type Account,
  type Allocation,
  type PaymentMethod,
  type SaveVoucherInput,
  type VoucherDetail,
} from '../../../api'
import {
  emptyOwnRow,
  expandOwnRowsToEntries,
  groupOwnRows,
  matchAndHideDuplicates,
  type StatementOwnRow,
} from '../../../book/bankStatement'
import { isPurchaseVatCode, isVatBookingLine, vatAccount, vatCompanionCode } from '../../../book/modules/vat/domain/vatPosting'
import { isVatLiableSetting } from '../../../book/settings'
import { ALL_COUNTER_ACCOUNTS } from '../../../book/paymentMethods'
import { DELETABLE_TYPES, ENTRY_COUNTER_POSTING, ENTRY_POSTING, STATUS_TEMPLATE } from '../../../book/vouchers'
import { vatFromKey, vatKey } from '../../vat/ui/vatCodes'
import { parseEurInput, formatEurInput } from '../../../shared/money'
import { SearchSelect, type SearchItem } from '../../../shared/SearchSelect'
import { EuroInput } from '../../../shared/EuroInput'
import { getBcp47, useI18n } from '../../../i18n'
import { nativePickerFocusProps } from '../../../shared/nativePicker'
import { voucherStatusName } from '../../../shared/voucherTypes'
import {
  defaultEditorTab,
  EDITOR_TABS,
  hasBookTab,
  voucherTypeDef,
  type EditorTab,
} from '../catalog'
import { wallToday } from '../../../book/clock'
import { AttachmentDropzone } from './AttachmentDropzone'
import { AttachmentGallery } from './AttachmentGallery'
import { EditorMenu, ToolGlyph } from './EditorMenu'
import { ExpenseIncomeForm } from './ExpenseIncomeForm'
import { EMPTY_ASSISTANT_ROW, descriptionIfDifferent, type AssistantRow } from './assistantRow'
import { StatementEditor } from './StatementEditor'
import { TransferForm } from './TransferForm'
import { TypeSelect } from './TypeSelect'
import { VatSelect } from './VatSelect'

type LineDraft = {
  account: string
  description: string
  debit: string
  credit: string
  vat_code: string
  vat_percent: string
  allocation: string
  archive_id: string
  accrual_starts: string
  accrual_ends: string
}

const EMPTY_LINE: LineDraft = {
  account: '',
  description: '',
  debit: '',
  credit: '',
  vat_code: '0',
  vat_percent: '',
  allocation: '0',
  archive_id: '',
  accrual_starts: '',
  accrual_ends: '',
}

function isBankAccount(a: Account): boolean {
  return a.type.startsWith('A') && (a.type.includes('R') || String(a.number).startsWith('19'))
}

function voucherNotes(json: Record<string, unknown> | undefined): string {
  const info = json?.info
  return typeof info === 'string' ? info : ''
}

function packEditor(fields: {
  type: number
  date: string
  title: string
  partner: string
  notes: string
  paymentAccount: string
  methodId: string
  fromAccount: string
  toAccount: string
  transferDescription: string
  amount: string
  start_date: string
  end_date: string
  bankAccount: string
  assistantRows: AssistantRow[]
  lines: LineDraft[]
  statementRows: StatementOwnRow[]
  files: File[]
  huomio: boolean
  docNumber: number | null
}): string {
  return JSON.stringify({
    type: fields.type,
    date: fields.date,
    title: fields.title,
    partner: fields.partner,
    notes: fields.notes,
    paymentAccount: fields.paymentAccount,
    methodId: fields.methodId,
    fromAccount: fields.fromAccount,
    toAccount: fields.toAccount,
    transferDescription: fields.transferDescription,
    amount: fields.amount,
    start_date: fields.start_date,
    end_date: fields.end_date,
    bankAccount: fields.bankAccount,
    assistantRows: fields.assistantRows,
    lines: fields.lines,
    statementRows: fields.statementRows,
    pendingFiles: fields.files.map((f) => `${f.name}:${f.size}`),
    huomio: fields.huomio,
    docNumber: fields.docNumber,
  })
}

export function VoucherEditor({
  voucherId,
  defaultType,
  defaultDate,
  copyFromId,
  onSaved,
  onCancel,
  onOpenVoucher,
  onCopyAsNew,
}: {
  voucherId: number | null
  defaultType: number | null
  defaultDate?: string
  copyFromId?: number
  onSaved: (id: number, opts?: { stay?: boolean }) => void
  onCancel: () => void
  onOpenVoucher: (id: number, opts?: { fromStatementId?: number }) => void
  onCopyAsNew: (type: number, fromId: number) => void
}) {
  const { t, locale } = useI18n()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [partnerItems, setPartnerItems] = useState<SearchItem[]>([])
  const [methodsExpense, setMethodsExpense] = useState<PaymentMethod[]>([])
  const [methodsIncome, setMethodsIncome] = useState<PaymentMethod[]>([])
  const [type, setType] = useState(defaultType ?? 100)
  const [date, setDate] = useState(() => defaultDate || wallToday())
  const [title, setTitle] = useState('')
  const [partner, setPartner] = useState('')
  const [status, setStatus] = useState(100)
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [existing, setExisting] = useState<VoucherDetail | null>(null)
  const [notes, setNotes] = useState('')
  const [start_date, setStartDate] = useState('')
  const [end_date, setEndDate] = useState('')
  const [bankAccount, setBankAccount] = useState('1910')
  const [statementRows, setStatementRows] = useState<StatementOwnRow[]>(() => [
    emptyOwnRow(defaultDate || wallToday()),
  ])
  const [paymentAccount, setPaymentAccount] = useState('1910')
  const [methodId, setMethodId] = useState(ALL_COUNTER_ACCOUNTS)
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount] = useState('')
  const [transferDescription, setTransferDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [assistantRows, setAssistantRows] = useState<AssistantRow[]>([
    { ...EMPTY_ASSISTANT_ROW, vatChoice: defaultType === 200 ? '11:25.5' : '21:25.5' },
  ])
  const [selectedRow, setSelectedRow] = useState(0)
  const [tab, setTab] = useState<EditorTab>(() => defaultEditorTab(defaultType ?? 100))
  const [baseline, setBaseline] = useState<string | null>(null)
  const [huomio, setHuomio] = useState(false)
  const [docNumber, setDocNumber] = useState<number | null>(null)
  const [neighbors, setNeighbors] = useState<{ prev: number | null; next: number | null }>({
    prev: null,
    next: null,
  })
  const [vatLiable, setVatLiable] = useState(true)
  const vatLiableRef = useRef(true)
  vatLiableRef.current = vatLiable
  const actionsRef = useRef({
    requestCancel: () => undefined as void,
    savePosted: (_opts?: { close?: boolean }) => undefined as void,
    saveDraft: (_opts?: { close?: boolean }) => undefined as void,
    goToVoucher: () => undefined as void,
    printVoucher: () => undefined as void,
    copyAsNew: () => undefined as void,
    toggleHuomio: () => undefined as void,
    goPrev: () => undefined as void,
    goNext: () => undefined as void,
    showDraft: true,
    canPost: false,
    canSaveDraft: false,
  })

  const accountItems: SearchItem[] = useMemo(
    () => accounts.map((a) => ({ value: String(a.number), label: `${a.number} ${a.name}` })),
    [accounts],
  )
  const bankItems = useMemo(
    () =>
      accounts
        .filter(isBankAccount)
        .map((a) => ({ value: String(a.number), label: `${a.number} ${a.name}` })),
    [accounts],
  )
  const allocationItems: SearchItem[] = useMemo(
    () =>
      allocations.map((k) => ({
        value: String(k.id),
        label: k.id === 0 ? t('common.general') : k.name,
      })),
    [allocations, t, locale],
  )

  const layout = voucherTypeDef(type).layout
  const assistant = layout === 'expense' || layout === 'income'
  const paymentMethods = useMemo(() => {
    const fromSettings = type === 200 ? methodsIncome : methodsExpense
    if (fromSettings.length) return fromSettings
    return bankItems.map((a) => ({
      name: a.label,
      account: Number(a.value),
      icon: 'pankki',
      new_era: false,
    }))
  }, [type, methodsExpense, methodsIncome, bankItems])

  useEffect(() => {
    fetchAccounts().then((d) => setAccounts(d.accounts)).catch(() => undefined)
    fetchAllocations()
      .then((d) => setAllocations(d.allocations))
      .catch(() => undefined)
    fetchPartners()
      .then((d) =>
        setPartnerItems(d.partners.map((k) => ({ value: k.name, label: k.name }))),
      )
      .catch(() => undefined)
    fetchSettings()
      .then((d) => {
        setMethodsExpense(d.payment_methods?.expense ?? [])
        setMethodsIncome(d.payment_methods?.income ?? [])
        setVatLiable(isVatLiableSetting(d.company.AlvVelvollinen))
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (vatLiable) return
    setAssistantRows((prev) =>
      prev.map((row) => (row.vatChoice === '0:0' ? row : { ...row, vatChoice: '0:0' })),
    )
    setLines((prev) =>
      prev.map((line) =>
        line.vat_code === '0' && !line.vat_percent
          ? line
          : { ...line, vat_code: '0', vat_percent: '' },
      ),
    )
  }, [vatLiable])

  useEffect(() => {
    const sourceId = voucherId ?? copyFromId ?? null
    if (!sourceId) {
      setExisting(null)
      setHuomio(false)
      setDocNumber(null)
      return
    }
    const asCopy = voucherId == null && copyFromId != null
    setBaseline(null)
    fetchVoucher(sourceId).then((data) => {
      const liable = vatLiableRef.current
      const mapped: LineDraft[] = data.entries.length
        ? data.entries.map((v) => ({
            account: String(v.account),
            description: v.description,
            debit: formatEurInput(v.debit_cents ?? 0, { emptyZero: true }),
            credit: formatEurInput(v.credit_cents ?? 0, { emptyZero: true }),
            vat_code: liable ? String(v.vat_code ?? 0) : '0',
            vat_percent: liable && v.vat_percent != null ? String(v.vat_percent) : '',
            allocation: String(v.allocation ?? 0),
            archive_id: v.archive_id || '',
            accrual_starts: v.accrual_starts || '',
            accrual_ends: v.accrual_ends || '',
          }))
        : [{ ...EMPTY_LINE }]
      const bankLine = mapped.find((l) => {
        const acc = accounts.find((a) => String(a.number) === l.account)
        return acc ? isBankAccount(acc) : l.account.startsWith('19')
      })
      const netLines = mapped.filter((l) => !isVatBookingLine(l) && l !== bankLine)
      const fallbackVat = liable
        ? data.type === 200
          ? '11:25.5'
          : '21:25.5'
        : '0:0'
      const nextRows: AssistantRow[] = netLines.length
        ? netLines.map((line) => {
            const net = parseEurInput(line.debit || line.credit)
            const pct = liable ? Number(line.vat_percent || 0) : 0
            const gross = pct ? Math.round((net * (100 + pct)) / 100) : net
            return {
              account: line.account,
              amount: formatEurInput(gross, { emptyZero: true }),
              vatChoice: liable
                ? vatKey(Number(line.vat_code || 0), Number(line.vat_percent || 0))
                : '0:0',
              allocation: line.allocation || '0',
              accrual_starts: line.accrual_starts,
              accrual_ends: line.accrual_ends,
              description: descriptionIfDifferent(line.description, data.title),
            }
          })
        : [{ ...EMPTY_ASSISTANT_ROW, vatChoice: fallbackVat }]
      const first = netLines[0]
      const nextPayment = bankLine?.account || '1910'
      const nextAmount = bankLine ? bankLine.debit || bankLine.credit : ''
      const nextFrom = first ? mapped.find((l) => l.credit)?.account || first.account : ''
      const nextTo = first ? mapped.find((l) => l.debit)?.account || first.account : ''
      const nextTransfer = descriptionIfDifferent(first?.description || '', data.title)
      const nextStart = data.bank_statement?.start_date || ''
      const nextEnd = data.bank_statement?.end_date || ''
      const nextBank = String(data.bank_statement?.account || 1910)
      const grouped =
        data.type === 400 ? groupOwnRows(data.entries, Number(nextBank)) : []
      const nextStatement =
        data.type === 400
          ? grouped.length
            ? grouped
            : [emptyOwnRow(nextEnd || data.date)]
          : [emptyOwnRow(data.date)]
      const nextNotes = data.notes || voucherNotes(data.json)
      const nextPartner = data.partner?.name || ''
      const nextHuomio = Boolean(data.json?.huomio)
      const nextDoc = asCopy ? null : data.doc_number
      if (asCopy) {
        setExisting(null)
        setStatus(100)
      } else {
        setExisting(data)
        setStatus(data.status)
      }
      setType(data.type)
      setDate(data.date)
      setTitle(data.title)
      setPartner(nextPartner)
      setNotes(nextNotes)
      setTab(defaultEditorTab(data.type))
      setLines(mapped)
      setStartDate(nextStart)
      setEndDate(nextEnd)
      setBankAccount(nextBank)
      setStatementRows(nextStatement)
      setPaymentAccount(nextPayment)
      setAmount(nextAmount)
      setAssistantRows(nextRows)
      setSelectedRow(0)
      setFromAccount(nextFrom)
      setToAccount(nextTo)
      setTransferDescription(nextTransfer)
      setFiles([])
      setMethodId(ALL_COUNTER_ACCOUNTS)
      setHuomio(nextHuomio)
      setDocNumber(nextDoc)
      setBaseline(
        packEditor({
          type: data.type,
          date: data.date,
          title: data.title,
          partner: nextPartner,
          notes: nextNotes,
          paymentAccount: nextPayment,
          methodId: ALL_COUNTER_ACCOUNTS,
          fromAccount: nextFrom,
          toAccount: nextTo,
          transferDescription: nextTransfer,
          amount: nextAmount,
          start_date: nextStart,
          end_date: nextEnd,
          bankAccount: nextBank,
          assistantRows: nextRows,
          lines: mapped,
          statementRows: nextStatement,
          files: [],
          huomio: nextHuomio,
          docNumber: nextDoc,
        }),
      )
    })
  }, [voucherId, copyFromId, accounts])

  const editorPack = packEditor({
    type,
    date,
    title,
    partner,
    notes,
    paymentAccount,
    methodId,
    fromAccount,
    toAccount,
    transferDescription,
    amount,
    start_date,
    end_date,
    bankAccount,
    assistantRows,
    lines,
    statementRows,
    files,
    huomio,
    docNumber,
  })

  useEffect(() => {
    if (voucherId) return
    setExisting(null)
    setBaseline((prev) => prev ?? editorPack)
  }, [voucherId, editorPack])

  const dirty = baseline != null && editorPack !== baseline
  const postedExisting = existing != null && status >= 100
  const showDraft = !postedExisting

  useEffect(() => {
    if (!voucherId || !date) {
      setNeighbors({ prev: null, next: null })
      return
    }
    const year = date.slice(0, 4)
    let cancelled = false
    fetchVouchers({ start_date: `${year}-01-01`, end_date: `${year}-12-31` })
      .then((res) => {
        if (cancelled) return
        const ids = res.vouchers.map((row) => row.id)
        const i = ids.indexOf(voucherId)
        setNeighbors({
          prev: i > 0 ? ids[i - 1] : null,
          next: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null,
        })
      })
      .catch(() => {
        if (!cancelled) setNeighbors({ prev: null, next: null })
      })
    return () => {
      cancelled = true
    }
  }, [voucherId, date])

  function defaultVatChoice(voucherType: number): string {
    if (!vatLiable) return '0:0'
    return voucherType === 200 ? '11:25.5' : '21:25.5'
  }

  function changeType(next: number) {
    setType(next)
    setTab(defaultEditorTab(next))
    if (next === 100 || next === 200) {
      setAssistantRows((prev) => prev.map((row) => ({ ...row, vatChoice: defaultVatChoice(next) })))
    }
  }

  function requestCancel() {
    if (dirty && !window.confirm(t('editor.discardChanges'))) return
    onCancel()
  }

  function confirmLeave(): boolean {
    if (dirty && !window.confirm(t('editor.leaveUnsaved'))) return false
    return true
  }

  function openNeighbor(id: number | null) {
    if (id == null || !confirmLeave()) return
    onOpenVoucher(id)
  }

  function goToVoucher() {
    const raw = window.prompt(t('editor.goToPrompt'), docNumber != null ? String(docNumber) : '')
    if (raw == null) return
    const n = Number(raw.trim())
    if (!n) return
    if (!confirmLeave()) return
    const year = date.slice(0, 4) || String(new Date().getFullYear())
    void fetchVouchers({ start_date: `${year}-01-01`, end_date: `${year}-12-31` }).then((res) => {
      const match = res.vouchers.find((row) => row.doc_number === n)
      if (!match) {
        window.alert(t('editor.goToNotFound'))
        return
      }
      onOpenVoucher(match.id)
    })
  }

  function printVoucher() {
    window.print()
  }

  function copyAsNew() {
    if (!voucherId || dirty) return
    onCopyAsNew(type, voucherId)
  }

  function changeDocNumber() {
    const raw = window.prompt(
      t('editor.changeDocNumberPrompt'),
      docNumber != null ? String(docNumber) : '',
    )
    if (raw == null) return
    const n = Number(raw.trim())
    if (!n) return
    setDocNumber(n)
  }

  function clearEntries() {
    setAssistantRows([
      { ...EMPTY_ASSISTANT_ROW, vatChoice: type === 200 ? '11:25.5' : '21:25.5' },
    ])
    setSelectedRow(0)
    setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }])
    setStatementRows([emptyOwnRow(end_date || date)])
    setAmount('')
  }

  async function removeVoucher() {
    if (!existing || !DELETABLE_TYPES.has(existing.type) || existing.status < 50) return
    const msg =
      existing.type === 9100 ? t('voucher.confirmDeleteVat') : t('voucher.confirmDelete')
    if (!window.confirm(msg)) return
    setSaving(true)
    setError(null)
    try {
      await deleteVoucher(existing.id)
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, idx) => (idx === i ? { ...line, ...patch } : line)))
  }

  function addFiles(next: File[]) {
    if (!next.length) return
    setFiles((prev) => {
      const names = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`))
      const extra = next.filter((f) => !names.has(`${f.name}:${f.size}:${f.lastModified}`))
      return extra.length ? [...prev, ...extra] : prev
    })
  }

  function linesFromAssistant(): LineDraft[] {
    const isMeno = type === 100
    const out: LineDraft[] = []
    let grossTotal = 0
    for (const row of assistantRows) {
      const vat = vatFromKey(vatLiable ? row.vatChoice : '0:0')
      const gross = parseEurInput(row.amount)
      if (!row.account || !gross) continue
      grossTotal += gross
      const vatCents =
        vat.code && vat.percent ? Math.round((gross * vat.percent) / (100 + vat.percent)) : 0
      const netCents = gross - vatCents
      const desc = row.description || title
      out.push({
        ...EMPTY_LINE,
        account: row.account,
        description: desc,
        debit: isMeno ? formatEurInput(netCents, { emptyZero: true }) : '',
        credit: isMeno ? '' : formatEurInput(netCents, { emptyZero: true }),
        vat_code: String(vat.code),
        vat_percent: vat.percent ? String(vat.percent) : '',
        allocation: row.allocation,
        accrual_starts: row.accrual_starts,
        accrual_ends: row.accrual_ends,
      })
      const vatAcc = vatAccount(vat.code)
      if (vatLiable && vatAcc && vatCents) {
        const purchase = isPurchaseVatCode(vat.code)
        out.push({
          ...EMPTY_LINE,
          account: String(vatAcc),
          description: 'ALV',
          debit: purchase ? formatEurInput(vatCents, { emptyZero: true }) : '',
          credit: purchase ? '' : formatEurInput(vatCents, { emptyZero: true }),
          vat_code: String(vatCompanionCode(vat.code)),
          vat_percent: String(vat.percent),
          allocation: '0',
        })
      }
    }
    if (!paymentAccount || !grossTotal) return []
    out.unshift({
      ...EMPTY_LINE,
      account: paymentAccount,
      description: title,
      debit: isMeno ? '' : formatEurInput(grossTotal, { emptyZero: true }),
      credit: isMeno ? formatEurInput(grossTotal, { emptyZero: true }) : '',
      allocation: '0',
    })
    return out
  }

  function linesFromTransfer(): LineDraft[] {
    const gross = parseEurInput(amount)
    if (!fromAccount || !toAccount || !gross) return []
    const desc = transferDescription || title
    const eur = formatEurInput(gross, { emptyZero: true })
    return [
      { ...EMPTY_LINE, account: fromAccount, description: desc, credit: eur },
      { ...EMPTY_LINE, account: toAccount, description: desc, debit: eur },
    ]
  }

  /** Expand statement book rows into the Viennit table draft. */
  function linesFromStatement(rows: StatementOwnRow[] = statementRows): LineDraft[] {
    const bank = Number(bankAccount)
    const entries = expandOwnRowsToEntries(
      rows.filter((r) => r.amountCents && (r.counterAccount || r.rawEntries?.length)),
      bank,
    )
    if (!entries.length) return [{ ...EMPTY_LINE }]
    return entries.map((v) => ({
      account: String(v.account),
      description: v.description || '',
      debit: formatEurInput(v.debit_cents ?? 0, { emptyZero: true }),
      credit: formatEurInput(v.credit_cents ?? 0, { emptyZero: true }),
      vat_code: vatLiable ? String(v.vat_code ?? 0) : '0',
      vat_percent: vatLiable && v.vat_percent != null ? String(v.vat_percent) : '',
      allocation: String(v.allocation ?? 0),
      archive_id: v.archive_id || '',
      accrual_starts: v.accrual_starts || '',
      accrual_ends: v.accrual_ends || '',
    }))
  }

  /** Regroup Viennit drafts into statement book rows (best-effort payee restore). */
  function statementRowsFromLines(drafts: LineDraft[]): StatementOwnRow[] {
    const bank = Number(bankAccount)
    const rowDate = end_date || date
    const entries = drafts
      .filter((l) => l.account)
      .map((l, i) => {
        const account = Number(l.account)
        return {
          line_no: i + 1,
          entry_type: account === bank ? ENTRY_COUNTER_POSTING : ENTRY_POSTING,
          date: rowDate,
          account,
          description: l.description,
          debit_cents: l.debit ? parseEurInput(l.debit) : null,
          credit_cents: l.credit ? parseEurInput(l.credit) : null,
          vat_code: Number(l.vat_code || 0),
          vat_percent: l.vat_percent ? Number(l.vat_percent) : null,
          allocation: Number(l.allocation || 0),
          archive_id: l.archive_id || undefined,
        }
      })
    const grouped = groupOwnRows(entries, bank)
    if (!grouped.length) return [emptyOwnRow(rowDate)]
    return grouped.map((row) => {
      const archive = (row.archive_id || '').trim()
      const prev =
        (archive
          ? statementRows.find((r) => (r.archive_id || '').trim() === archive)
          : undefined) ||
        statementRows.find((r) => r.amountCents === row.amountCents && r.date === row.date) ||
        statementRows.find((r) => r.amountCents === row.amountCents)
      if (!prev) return row
      return {
        ...row,
        payee: row.payee || prev.payee,
        date: prev.date || row.date,
        bankEntryId: prev.bankEntryId ?? row.bankEntryId,
        entryIds: prev.entryIds ?? row.entryIds,
      }
    })
  }

  function expandVat(base: LineDraft[]): LineDraft[] {
    if (!assistant || !vatLiable) return base
    const out: LineDraft[] = []
    for (const line of base) {
      out.push(line)
      if (isVatBookingLine(line)) continue
      const code = Number(line.vat_code || 0)
      const pct = Number(line.vat_percent || 0)
      const netCents = parseEurInput(line.debit || line.credit)
      const vatAcc = vatAccount(code)
      if (!vatAcc || pct <= 0 || netCents <= 0) continue
      const vatCents = Math.round((netCents * pct) / 100)
      const vatEur = formatEurInput(vatCents, { emptyZero: true })
      const isPurchase = isPurchaseVatCode(code)
      out.push({
        ...EMPTY_LINE,
        account: String(vatAcc),
        description: 'ALV',
        debit: isPurchase ? vatEur : '',
        credit: isPurchase ? '' : vatEur,
        vat_code: String(vatCompanionCode(code)),
        vat_percent: String(pct),
      })
    }
    return out
  }

  function stripVatIfNeeded(base: LineDraft[]): LineDraft[] {
    if (vatLiable) return base
    return base
      .filter((l) => !isVatBookingLine(l))
      .map((l) => ({ ...l, vat_code: '0', vat_percent: '' }))
  }

  function builtLines(): LineDraft[] {
    if (assistant && tab !== 'entries') return stripVatIfNeeded(linesFromAssistant())
    if (layout === 'transfer' && tab !== 'entries') return linesFromTransfer()
    return stripVatIfNeeded(lines.filter((l) => l.account))
  }

  async function statementSaveEntries(rowsIn?: StatementOwnRow[]) {
    const bank = Number(bankAccount)
    let rows = rowsIn ?? statementRows
    if (bank && start_date && end_date) {
      try {
        const overlay = await fetchBankStatementOverlay({
          account: bank,
          startDate: start_date,
          endDate: end_date,
          excludeVoucherId: existing?.id ?? voucherId,
        })
        rows = matchAndHideDuplicates(rows, overlay.other)
      } catch {
        /* save without peitto if overlay fails */
      }
    }
    return expandOwnRowsToEntries(
      rows.filter((r) => r.amountCents && (r.counterAccount || r.rawEntries?.length)),
      bank,
    )
  }

  function canPost(): boolean {
    if (voucherId != null && (baseline == null || editorPack === baseline)) return false
    if (!date) return false
    if (layout === 'attachment') return true
    if (layout === 'statement') {
      const rows = tab === 'entries' ? statementRowsFromLines(lines) : statementRows
      const bank = Number(bankAccount)
      const entries = expandOwnRowsToEntries(
        rows.filter((r) => r.amountCents && (r.counterAccount || r.rawEntries?.length)),
        bank,
      )
      if (!entries.length) return false
      let debit = 0
      let credit = 0
      for (const line of entries) {
        if (!line.account) return false
        debit += Number(line.debit_cents || 0)
        credit += Number(line.credit_cents || 0)
      }
      return debit > 0 && debit === credit
    }
    const source = builtLines()
    const expanded = assistant ? source : expandVat(source)
    if (!expanded.length) return false
    let debit = 0
    let credit = 0
    for (const line of expanded) {
      if (!line.account) return false
      debit += parseEurInput(line.debit)
      credit += parseEurInput(line.credit)
    }
    return debit > 0 && debit === credit
  }

  function canSaveDraft(): boolean {
    return Boolean(
      date &&
        (title ||
          partner ||
          notes ||
          files.length ||
          amount ||
          assistantRows.some((r) => r.account || r.amount) ||
          lines.some((l) => l.account) ||
          statementRows.some((r) => r.amountCents || r.counterAccount || r.payee)),
    )
  }

  async function persist(nextTila: number, _opts?: { close?: boolean }) {
    setSaving(true)
    setError(null)
    try {
      let entries: SaveVoucherInput['entries']
      if (type === 800) {
        entries = []
      } else if (layout === 'statement') {
        const rows = tab === 'entries' ? statementRowsFromLines(lines) : statementRows
        if (tab === 'entries') setStatementRows(rows)
        entries = await statementSaveEntries(rows)
      } else {
        const source = builtLines()
        const expanded = assistant ? source : expandVat(source)
        entries = expanded.map((line, i) => {
          const vatCode = Number(line.vat_code || 0)
          const parked = vatCode === 418 || vatCode === 428
          return {
            line_no: i + 1,
            account: Number(line.account),
            description: line.description || title,
            debit_cents: line.debit ? parseEurInput(line.debit) : null,
            credit_cents: line.credit ? parseEurInput(line.credit) : null,
            vat_code: vatCode,
            vat_percent: line.vat_percent ? Number(line.vat_percent) : null,
            allocation: Number(line.allocation || 0),
            archive_id: line.archive_id || null,
            accrual_starts: line.accrual_starts || null,
            accrual_ends: line.accrual_ends || null,
            ...(parked ? { item_id: -1, new_era: true } : {}),
          }
        })
      }
      const json: Record<string, unknown> = { ...(existing?.json || {}) }
      if (notes.trim()) json.info = notes.trim()
      else delete json.info
      if (huomio) json.huomio = true
      else delete json.huomio
      if (type === 400) {
        delete json.tiliote
        json.bank_statement = {
          start_date: start_date || date,
          end_date: end_date || date,
          account: Number(bankAccount),
        }
      }
      const saved = await saveVoucher(
        {
          date,
          type,
          status: nextTila,
          title,
          partner: partner ? { name: partner } : null,
          json,
          entries,
          ...(docNumber != null ? { doc_number: docNumber } : {}),
        } satisfies SaveVoucherInput,
        voucherId ?? undefined,
      )
      for (const file of files) await uploadAttachment(saved.id, file)
      setFiles([])
      // No separate view page: always stay in the editor. Esc / Peru leave to the parent.
      if (voucherId == null || voucherId !== saved.id) {
        onSaved(saved.id, { stay: true })
        return
      }
      const fresh = await fetchVoucher(saved.id)
      setExisting(fresh)
      setStatus(fresh.status)
      setDocNumber(fresh.doc_number)
      setHuomio(Boolean(fresh.json?.huomio))
      const freshBank = String(fresh.bank_statement?.account || bankAccount)
      const groupedFresh =
        fresh.type === 400 ? groupOwnRows(fresh.entries, Number(freshBank)) : []
      const freshStatement =
        fresh.type === 400
          ? groupedFresh.length
            ? groupedFresh
            : [emptyOwnRow(fresh.bank_statement?.end_date || fresh.date)]
          : statementRows
      setStatementRows(freshStatement)
      if (fresh.type === 400) {
        setBankAccount(freshBank)
        setStartDate(fresh.bank_statement?.start_date || start_date)
        setEndDate(fresh.bank_statement?.end_date || end_date)
      }
      const mappedLines: LineDraft[] = fresh.entries.length
        ? fresh.entries.map((v) => ({
            account: String(v.account),
            description: v.description,
            debit: formatEurInput(v.debit_cents ?? 0, { emptyZero: true }),
            credit: formatEurInput(v.credit_cents ?? 0, { emptyZero: true }),
            vat_code: vatLiable ? String(v.vat_code ?? 0) : '0',
            vat_percent: vatLiable && v.vat_percent != null ? String(v.vat_percent) : '',
            allocation: String(v.allocation ?? 0),
            archive_id: v.archive_id || '',
            accrual_starts: v.accrual_starts || '',
            accrual_ends: v.accrual_ends || '',
          }))
        : [{ ...EMPTY_LINE }]
      setLines(mappedLines)
      setBaseline(
        packEditor({
          type,
          date,
          title,
          partner,
          notes,
          paymentAccount,
          methodId,
          fromAccount,
          toAccount,
          transferDescription,
          amount,
          start_date: fresh.bank_statement?.start_date || start_date,
          end_date: fresh.bank_statement?.end_date || end_date,
          bankAccount: freshBank,
          assistantRows,
          lines: mappedLines,
          statementRows: freshStatement,
          files: [],
          huomio: Boolean(fresh.json?.huomio),
          docNumber: fresh.doc_number,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canPost()) return
    await persist(status >= 100 ? status : 100, { close: true })
  }

  const linesTable = type !== 800 ? (
        <section className="entries-edit">
          <table className="ledger-table editor-table">
            <thead>
              <tr>
                <th>{t('table.account')}</th>
                <th>{t('table.description')}</th>
                <th className="amount">{t('table.debit')}</th>
                <th className="amount">{t('table.credit')}</th>
                {vatLiable ? <th>{t('table.vat')}</th> : null}
                <th>{t('table.allocation')}</th>
                {type === 400 ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <SearchSelect
                      items={accountItems}
                      value={line.account}
                      onChange={(v) => updateLine(i, { account: v })}
                      placeholder={t('editor.searchAccount')}
                    />
                  </td>
                  <td>
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    <EuroInput
                      value={line.debit}
                      onChange={(debit) => updateLine(i, { debit, credit: '' })}
                    />
                  </td>
                  <td>
                    <EuroInput
                      value={line.credit}
                      onChange={(credit) => updateLine(i, { credit, debit: '' })}
                    />
                  </td>
                  {vatLiable ? (
                    <td>
                      <VatSelect
                        value={vatKey(Number(line.vat_code || 0), Number(line.vat_percent || 0))}
                        voucherType={type}
                        aria-label={t('table.vat')}
                        onChange={(key) => {
                          const c = vatFromKey(key)
                          updateLine(i, {
                            vat_code: String(c.code),
                            vat_percent: c.percent ? String(c.percent) : '',
                          })
                        }}
                      />
                    </td>
                  ) : null}
                  <td>
                    <SearchSelect
                      items={allocationItems}
                      value={line.allocation}
                      onChange={(v) => updateLine(i, { allocation: v })}
                    />
                  </td>
                  {type === 400 && existing ? (
                    <td>
                      <button
                        type="button"
                        className="btn-small"
                        onClick={async () => {
                          const v = existing.entries[i]
                          if (!v) return
                          try {
                            const row = statementRows.find(
                              (r) =>
                                r.bankEntryId === v.id || r.entryIds?.includes(v.id),
                            )
                            const own = await splitBankStatement(
                              existing.id,
                              v.id,
                              undefined,
                              row?.entryIds,
                            )
                            onSaved(own.id, { stay: true })
                          } catch (err) {
                            setError(err instanceof Error ? err.message : String(err))
                          }
                        }}
                      >
                        {t('editor.splitOff')}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="assistant-row-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
            >
              {t('editor.addLine')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={lines.length < 2}
              onClick={() => setLines((prev) => (prev.length < 2 ? prev : prev.slice(0, -1)))}
            >
              {t('editor.removeLine')}
            </button>
          </div>
        </section>
  ) : (
    <p className="muted">{t('editor.noLinesOnAttachment')}</p>
  )

  const canDelete =
    existing != null && DELETABLE_TYPES.has(existing.type) && existing.status >= 50
  const readyToPost = canPost()
  const readyToDraft = canSaveDraft()

  actionsRef.current = {
    requestCancel,
    savePosted: (opts?: { close?: boolean }) => {
      if (!readyToPost || saving) return
      void persist(status >= 100 ? status : 100, opts)
    },
    saveDraft: (opts?: { close?: boolean }) => {
      if (!showDraft || !readyToDraft || saving) return
      void persist(50, opts)
    },
    goToVoucher,
    printVoucher,
    copyAsNew,
    toggleHuomio: () => setHuomio((v) => !v),
    goPrev: () => openNeighbor(neighbors.prev),
    goNext: () => openNeighbor(neighbors.next),
    showDraft,
    canPost: readyToPost,
    canSaveDraft: readyToDraft,
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const a = actionsRef.current
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') {
        if (document.querySelector('.search-select-list, .editor-menu-list')) return
        e.preventDefault()
        a.requestCancel()
        return
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        a.goPrev()
        return
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        a.goNext()
        return
      }
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        if (e.shiftKey) a.savePosted()
        else if (a.canPost) a.savePosted({ close: true })
        else a.saveDraft({ close: true })
      } else if (key === 'g') {
        e.preventDefault()
        a.goToVoucher()
      } else if (key === 'p') {
        e.preventDefault()
        a.printVoucher()
      } else if (key === 't') {
        e.preventDefault()
        a.copyAsNew()
      } else if (key === 'h') {
        e.preventDefault()
        a.toggleHuomio()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const year = date.slice(0, 4)
  const visibleTabs = EDITOR_TABS.filter((item) => item.id !== 'book' || hasBookTab(type))
  const activeTab = visibleTabs.some((item) => item.id === tab) ? tab : visibleTabs[0]?.id
  const statementBook = layout === 'statement' && activeTab === 'book'

  return (
    <form className="editor voucher-work" onSubmit={onSubmit}>
      <div className={`editor-scroll${statementBook ? ' is-statement-book' : ''}`}>
      {error ? <p className="error">{error}</p> : null}

      <AttachmentDropzone
        files={files}
        existing={existing?.attachments.map((item) => ({
          id: item.id,
          name: item.name || item.role_name,
          type: item.type,
        }))}
        onAdd={addFiles}
        onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
      />

      <div className="voucher-meta-row">
        <label>
          {t('editor.voucherType')}
          <TypeSelect value={type} onChange={changeType} fixedMenu />
        </label>
        <label>
          {t('editor.voucherDate')}
          <input
            type="date"
            value={date}
            required
            {...nativePickerFocusProps(getBcp47())}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="grow">
          {t('editor.title')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>

      <div className="editor-tabs" role="tablist">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={activeTab === item.id ? 'is-active' : ''}
            aria-selected={activeTab === item.id}
            onClick={() => {
              if (item.id === 'entries' && assistant) {
                const built = linesFromAssistant()
                if (built.length) setLines(built)
              }
              if (item.id === 'entries' && layout === 'transfer') {
                const built = linesFromTransfer()
                if (built.length) setLines(built)
              }
              if (item.id === 'entries' && layout === 'statement') {
                setLines(linesFromStatement())
              }
              if (item.id === 'book' && layout === 'statement' && tab === 'entries') {
                setStatementRows(statementRowsFromLines(lines))
              }
              setTab(item.id)
            }}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'book' && assistant ? (
        <ExpenseIncomeForm
          type={type}
          methods={paymentMethods}
          methodId={methodId}
          onMethod={(id, account) => {
            setMethodId(id)
            if (account) setPaymentAccount(account)
          }}
          paymentAccount={paymentAccount}
          onPaymentAccount={setPaymentAccount}
          partner={partner}
          onPartner={setPartner}
          partnerItems={partnerItems}
          accountItems={accountItems}
          allocationItems={allocationItems}
          rows={assistantRows}
          selected={selectedRow}
          onSelect={setSelectedRow}
          showVat={vatLiable}
          onUpdateRow={(i, patch) =>
            setAssistantRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
          }
          onAddRow={() => {
            setAssistantRows((prev) => {
              const current = prev[selectedRow] ?? prev[0]
              return [
                ...prev,
                {
                  ...EMPTY_ASSISTANT_ROW,
                  account: current?.account ?? '',
                  vatChoice:
                    current?.vatChoice || defaultVatChoice(type),
                  allocation: current?.allocation || '0',
                },
              ]
            })
            setSelectedRow(assistantRows.length)
          }}
          onRemoveRow={() => {
            if (assistantRows.length < 2) return
            setAssistantRows((prev) => prev.filter((_, i) => i !== selectedRow))
            setSelectedRow((i) => Math.max(0, i - 1))
          }}
        />
      ) : null}

      {activeTab === 'book' && layout === 'transfer' ? (
        <TransferForm
          fromAccount={fromAccount}
          toAccount={toAccount}
          amount={amount}
          description={transferDescription}
          accountItems={accountItems}
          onFromAccount={setFromAccount}
          onToAccount={setToAccount}
          onAmount={setAmount}
          onDescription={setTransferDescription}
        />
      ) : null}

      {activeTab === 'book' && layout === 'statement' ? (
        <StatementEditor
          startDate={start_date}
          endDate={end_date}
          bankAccount={bankAccount}
          voucherId={existing?.id ?? voucherId}
          ownRows={statementRows}
          onOwnRowsChange={setStatementRows}
          onStartDate={setStartDate}
          onEndDate={setEndDate}
          onBankAccount={setBankAccount}
          bankItems={bankItems}
          accountItems={accountItems}
          allocationItems={allocationItems}
          vatLiable={vatLiable}
          onOpenVoucher={(id) => {
            if (!confirmLeave()) return
            const statementId = existing?.id ?? voucherId
            if (statementId != null) {
              onOpenVoucher(id, { fromStatementId: statementId })
              return
            }
            onOpenVoucher(id)
          }}
          onSplitRow={(row) => {
            void (async () => {
              if (!existing || !row.bankEntryId) {
                window.alert(t('editor.statementSaveBeforeSplit'))
                return
              }
              if (!confirmLeave()) return
              try {
                const own = await splitBankStatement(
                  existing.id,
                  row.bankEntryId,
                  undefined,
                  row.entryIds,
                )
                onSaved(own.id, { stay: true })
              } catch (err) {
                window.alert(err instanceof Error ? err.message : String(err))
              }
            })()
          }}
        />
      ) : null}

      {activeTab === 'entries' ? linesTable : null}

      {activeTab === 'notes' ? (
        <section className="notes-tab">
          <textarea
            className="notes-edit"
            rows={10}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('editor.notesPlaceholder')}
          />
        </section>
      ) : null}

      {activeTab === 'attachments' ? (
        <section className="attachments-tab">
          <AttachmentGallery
            pending={files}
            existing={existing?.attachments}
            onRemovePending={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
          />
        </section>
      ) : null}

      {activeTab === 'log' ? (
        <section className="log-tab">
          {existing?.log?.length ? (
            <table className="ledger-table zebra dense">
              <thead>
                <tr>
                  <th>{t('editor.logTime')}</th>
                  <th>{t('editor.logUser')}</th>
                  <th>{t('table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {existing.log.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.time || '—'}</td>
                    <td>{entry.user_id || '—'}</td>
                    <td>{voucherStatusName(entry.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">{t('editor.logEmpty')}</p>
          )}
        </section>
      ) : null}
      </div>

      <div className="editor-footer">
        <div className="editor-footer-left">
          {voucherId != null ? (
            <>
              <button
                type="button"
                className="editor-tool-btn"
                disabled={!neighbors.prev}
                aria-label={t('editor.prevVoucher')}
                title={t('editor.prevVoucher')}
                onClick={() => openNeighbor(neighbors.prev)}
              >
                <ToolGlyph>
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.8 5.2 8.2 12l6.6 6.8"
                  />
                </ToolGlyph>
              </button>
              <span className="editor-doc-number">{docNumber ?? '—'}</span>
              <button
                type="button"
                className="editor-tool-btn"
                disabled={!neighbors.next}
                aria-label={t('editor.nextVoucher')}
                title={t('editor.nextVoucher')}
                onClick={() => openNeighbor(neighbors.next)}
              >
                <ToolGlyph>
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.2 5.2 15.8 12 9.2 18.8"
                  />
                </ToolGlyph>
              </button>
              {year ? <span className="editor-doc-year">{year}</span> : null}
            </>
          ) : (
            <span className="editor-doc-new">{t('editor.newTitle')}</span>
          )}
          <button
            type="button"
            className={`editor-tool-btn editor-attention${huomio ? ' is-on' : ''}`}
            aria-pressed={huomio}
            aria-label={t('editor.attention')}
            title={t('editor.attentionHint')}
            onClick={() => setHuomio((v) => !v)}
          >
            !
          </button>
          {showDraft ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={saving || !readyToDraft}
              title={t('editor.saveDraftHint')}
              onClick={() => void persist(50)}
            >
              {t('editor.saveDraft')}
            </button>
          ) : null}
        </div>
        <div className="editor-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || !readyToPost}
            title={t('editor.doneHint')}
          >
            {saving ? t('editor.saving') : t('editor.done')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            title={t('editor.cancelHint')}
            onClick={requestCancel}
          >
            {t('editor.cancel')}
          </button>
          <EditorMenu
            label={t('editor.moreActions')}
            items={[
              {
                id: 'go',
                label: t('editor.goToVoucher'),
                shortcut: t('editor.shortcutGo'),
                icon: 'search',
                onSelect: goToVoucher,
              },
              {
                id: 'print',
                label: t('editor.printVoucher'),
                shortcut: t('editor.shortcutPrint'),
                icon: 'print',
                onSelect: printVoucher,
              },
              {
                id: 'copy',
                label: t('editor.copyAsNew'),
                shortcut: t('editor.shortcutCopy'),
                icon: 'copy',
                disabled: !voucherId || dirty,
                onSelect: copyAsNew,
              },
              {
                id: 'template',
                label: t('editor.saveAsTemplate'),
                icon: 'template',
                disabled: voucherId != null || saving,
                onSelect: () => void persist(STATUS_TEMPLATE),
              },
              {
                id: 'delete',
                label: t('editor.deleteVoucher'),
                icon: 'trash',
                disabled: !canDelete || saving,
                onSelect: () => void removeVoucher(),
              },
              {
                id: 'clear',
                label: t('editor.clearEntries'),
                icon: 'broom',
                onSelect: clearEntries,
              },
              {
                id: 'number',
                label: t('editor.changeDocNumber'),
                icon: 'numbers',
                onSelect: changeDocNumber,
              },
            ]}
          />
        </div>
      </div>
    </form>
  )
}
