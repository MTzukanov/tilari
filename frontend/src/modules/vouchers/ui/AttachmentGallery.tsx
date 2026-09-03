import { useEffect, useState } from 'react'
import { attachmentHref } from '../../../api'
import { useI18n } from '../../../i18n'

function isImageType(type: string, name = ''): boolean {
  if (type.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
}

function isPdfType(type: string, name = ''): boolean {
  if (type === 'application/pdf') return true
  return /\.pdf$/i.test(name)
}

function FileThumb({ file, href }: { file?: File; href?: string }) {
  const [url, setUrl] = useState(href || '')
  useEffect(() => {
    if (href) {
      setUrl(href)
      return
    }
    if (!file) return
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file, href])
  const type = file?.type || ''
  const name = file?.name || ''
  const src = href || url
  if (isImageType(type, name) && src) {
    return <img className="att-thumb-img" src={src} alt="" />
  }
  if (isPdfType(type, name)) {
    return <span className="att-thumb-pdf-mark">PDF</span>
  }
  return <span className="att-thumb-file" aria-hidden />
}

function ExistingThumb({ id, name, type }: { id: number; name: string; type: string }) {
  const [href, setHref] = useState('')
  useEffect(() => {
    let cancelled = false
    void attachmentHref(id).then((url) => {
      if (!cancelled) setHref(url)
    })
    return () => {
      cancelled = true
    }
  }, [id])
  if (!href) return <span className="muted">{name}</span>
  return (
    <a className="att-card" href={href} target="_blank" rel="noopener noreferrer">
      <span className="att-thumb">
        <FileThumb href={href} file={new File([], name, { type })} />
      </span>
      <span className="att-name">{name}</span>
    </a>
  )
}

export function AttachmentGallery({
  pending,
  existing,
  onRemovePending,
}: {
  pending: File[]
  existing?: { id: number; name: string; type: string }[]
  onRemovePending?: (index: number) => void
}) {
  const { t } = useI18n()
  const hasExisting = Boolean(existing?.length)
  const hasPending = pending.length > 0
  if (!hasExisting && !hasPending) {
    return <p className="muted">{t('editor.noAttachments')}</p>
  }
  return (
    <ul className="att-gallery">
      {existing?.map((item) => (
        <li key={`e-${item.id}`}>
          <ExistingThumb id={item.id} name={item.name} type={item.type} />
        </li>
      ))}
      {pending.map((file, i) => (
        <li key={`p-${file.name}-${file.size}-${i}`}>
          <PendingCard file={file} onRemove={onRemovePending ? () => onRemovePending(i) : undefined} />
        </li>
      ))}
    </ul>
  )
}

function PendingCard({ file, onRemove }: { file: File; onRemove?: () => void }) {
  const { t } = useI18n()
  const [href] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(href), [href])
  return (
    <div className="att-card att-card-pending">
      <a className="att-thumb-link" href={href} target="_blank" rel="noopener noreferrer">
        <span className="att-thumb">
          <FileThumb file={file} href={href} />
        </span>
        <span className="att-name">{file.name}</span>
      </a>
      {onRemove ? (
        <button type="button" className="linkish" onClick={onRemove}>
          {t('editor.removeFile')}
        </button>
      ) : null}
    </div>
  )
}
