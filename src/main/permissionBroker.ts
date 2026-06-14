import type { PermissionRequest } from '@shared/types'

type PermissionResolve = (approved: boolean, answers?: Record<string, string>) => void

export class PermissionBroker {
  private entries = new Map<
    string,
    { request: PermissionRequest; resolve: PermissionResolve }
  >()

  get size(): number {
    return this.entries.size
  }

  add(request: PermissionRequest, resolve: PermissionResolve): void {
    this.entries.set(request.requestId, { request, resolve })
  }

  delete(requestId: string): void {
    this.entries.delete(requestId)
  }

  resolve(requestId: string, approved: boolean, answers?: Record<string, string>): boolean {
    const entry = this.entries.get(requestId)
    if (!entry) return false
    this.entries.delete(requestId)
    entry.resolve(approved, answers)
    return true
  }

  clearDoc(docId: string): string[] {
    const ids: string[] = []
    for (const [requestId, entry] of this.entries) {
      if (entry.request.docId !== docId) continue
      this.entries.delete(requestId)
      ids.push(requestId)
      entry.resolve(false)
    }
    return ids
  }

  requestsForDoc(docId: string): PermissionRequest[] {
    return [...this.entries.values()]
      .filter((entry) => entry.request.docId === docId)
      .map((entry) => entry.request)
  }

  hasAnyForDoc(docId: string): boolean {
    return this.requestsForDoc(docId).length > 0
  }
}
