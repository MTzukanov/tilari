import { describe, expect, it } from 'vitest'
import { storageError } from './storageError'

const supabase = (statusCode: string, error: string, message: string) =>
  JSON.stringify({ statusCode, error, message })

describe('storageError', () => {
  it('reads the real status from the Supabase HTTP 400 envelope', () => {
    expect(storageError(400, supabase('404', 'not_found', 'Object not found'), 'download_failed').message).toBe(
      'not_found',
    )
    expect(storageError(400, supabase('409', 'Duplicate', 'The resource already exists'), 'upload_failed').message).toBe(
      'duplicate',
    )
  })

  it('maps an RLS refusal to locker_forbidden and keeps the server message', () => {
    const err = storageError(
      400,
      supabase('403', 'Unauthorized', 'new row violates row-level security policy'),
      'upload_failed',
    )
    expect(err.message).toBe('locker_forbidden')
    expect(err.cause).toBe('new row violates row-level security policy')
  })

  it('maps a bare 401/403 to locker_forbidden', () => {
    expect(storageError(403, '', 'exists_failed').message).toBe('locker_forbidden')
    expect(storageError(401, JSON.stringify({ message: 'Invalid API key' }), 'locker_list_failed').cause).toBe(
      'Invalid API key',
    )
  })

  it('keeps the fallback code for other failures, with the reason as cause', () => {
    const err = storageError(
      400,
      supabase('413', 'Payload too large', 'The object exceeded the maximum allowed size'),
      'upload_failed',
    )
    expect(err.message).toBe('upload_failed')
    expect(err.cause).toBe('The object exceeded the maximum allowed size')
    const node = storageError(400, JSON.stringify({ detail: 'invalid_path' }), 'upload_failed')
    expect([node.message, node.cause]).toEqual(['upload_failed', 'invalid_path'])
    expect(storageError(502, '<html>Bad gateway</html>', 'download_failed').cause).toBeUndefined()
  })
})
