/** What locker PUTs a save should send. */

export function lockerUploadPlan(
  dirty: boolean,
  attachmentsDirty: boolean,
  lockerId?: string,
): { skip: boolean; needLedger: boolean; needAttachments: boolean } {
  const creating = !lockerId
  return {
    skip: !dirty && !attachmentsDirty && !creating,
    needLedger: dirty || creating,
    needAttachments: attachmentsDirty || creating,
  }
}
