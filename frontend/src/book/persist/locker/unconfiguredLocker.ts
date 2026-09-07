import type { LockerBackend } from './types'

/** Shelf backend when no BYO locker is connected — never falls back to pack/session httpLocker. */
export function createUnconfiguredShelfLocker(): LockerBackend {
  const reject = (): Promise<never> => Promise.reject(new Error('locker_not_configured'))
  return {
    id: 'http',
    supportsHttpEngine: false,
    async connect(): Promise<void> {
      throw new Error('locker_not_configured')
    },
    disconnect(): void {},
    isReady(): boolean {
      return false
    },
    list: reject,
    get: reject,
    put: reject,
    getAttachmentBlob: reject,
    getAttachments: reject,
    putAttachments: reject,
    putAttachmentBlobs: reject,
    remove: reject,
    gcUnusedBlobs: () => reject(),
  }
}
