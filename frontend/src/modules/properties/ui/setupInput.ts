import type { DocCandidate, EraCandidate, PropertyKind, SetupApplyInput, SetupResponse } from '../api'

export type CentreDraft = { included: boolean; kind: PropertyKind | '' }

export function initialEra(e: EraCandidate): number | null {
  return e.linked_to ?? e.suggestion?.cost_centre_id ?? null
}

export function initialDoc(d: DocCandidate): number | null {
  return d.linked_to[0] ?? d.suggestion?.cost_centre_id ?? null
}

/** The changes to send: every cost centre gets a document, so setup stops asking. */
export function buildSetupInput(
  setup: SetupResponse,
  centres: Map<number, CentreDraft>,
  eraChoice: Map<number, number | null>,
  docChoice: Map<number, number | null>,
): SetupApplyInput {
  return {
    objects: setup.cost_centres.map((c) => {
      const draft = centres.get(c.id) ?? { included: true, kind: '' }
      const addEras = setup.eras
        .filter((e) => eraChoice.get(e.eraid) === c.id && e.linked_to !== c.id)
        .map((e) => e.eraid)
      const removeEras = setup.eras
        .filter((e) => e.linked_to === c.id && eraChoice.get(e.eraid) !== c.id)
        .map((e) => e.eraid)
      const addDocs = setup.docs
        .filter((d) => docChoice.get(d.voucher_id) === c.id && !d.linked_to.includes(c.id))
        .map((d) => d.voucher_id)
      const removeDocs = setup.docs
        .filter((d) => d.linked_to.includes(c.id) && docChoice.get(d.voucher_id) !== c.id)
        .map((d) => d.voucher_id)
      return {
        id: c.id,
        excluded: !draft.included,
        kind: draft.kind || null,
        ...(addEras.length ? { add_eras: addEras } : {}),
        ...(removeEras.length ? { remove_eras: removeEras } : {}),
        ...(addDocs.length ? { add_docs: addDocs } : {}),
        ...(removeDocs.length ? { remove_docs: removeDocs } : {}),
      }
    }),
  }
}
