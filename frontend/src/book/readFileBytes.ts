import type { TransferOpts } from './http'

function aborted(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

/** Read a File/Blob into bytes with progress.

Android Chrome + Google Drive hangs forever on `blob.arrayBuffer()`.
Streaming (or FileReader) actually pulls the `content://` document and can
report progress. */
export async function readFileBytes(blob: Blob, opts: TransferOpts = {}): Promise<Uint8Array> {
  if (opts.signal?.aborted) throw aborted()
  if (typeof blob.stream === 'function') {
    try {
      return await readWithStream(blob, opts)
    } catch (err) {
      if (opts.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw err
    }
  }
  return readWithFileReader(blob, opts)
}

async function readWithStream(blob: Blob, opts: TransferOpts): Promise<Uint8Array> {
  const reader = blob.stream().getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  const total = blob.size > 0 ? blob.size : null
  let lastYield = 0
  const onAbort = () => {
    void reader.cancel()
  }
  opts.signal?.addEventListener('abort', onAbort)
  try {
    opts.onProgress?.({ loaded: 0, total })
    for (;;) {
      if (opts.signal?.aborted) throw aborted()
      const { done, value } = await reader.read()
      if (done) break
      if (value?.byteLength) {
        chunks.push(value)
        loaded += value.byteLength
        opts.onProgress?.({ loaded, total: total && loaded > total ? loaded : total })
      }
      const now = Date.now()
      if (now - lastYield > 80) {
        lastYield = now
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }
  } finally {
    opts.signal?.removeEventListener('abort', onAbort)
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  opts.onProgress?.({ loaded, total: loaded })
  return out
}

function readWithFileReader(blob: Blob, opts: TransferOpts): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(aborted())
      return
    }
    const fr = new FileReader()
    const onAbort = () => {
      fr.abort()
      reject(aborted())
    }
    opts.signal?.addEventListener('abort', onAbort)
    const done = () => opts.signal?.removeEventListener('abort', onAbort)
    fr.onprogress = (e) => {
      const total = e.lengthComputable ? e.total : blob.size > 0 ? blob.size : null
      opts.onProgress?.({ loaded: e.loaded, total })
    }
    fr.onload = () => {
      done()
      resolve(new Uint8Array(fr.result as ArrayBuffer))
    }
    fr.onerror = () => {
      done()
      reject(fr.error || new Error('Failed to read file'))
    }
    fr.onabort = () => {
      done()
      reject(aborted())
    }
    fr.readAsArrayBuffer(blob)
  })
}
