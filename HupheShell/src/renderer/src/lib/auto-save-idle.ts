interface AutoSaverOptions {
  debounceMs?: number
  idleTimeout?: number
  onSave: () => Promise<void>
  onError?: (err: unknown) => void
}

export interface AutoSaver {
  schedule: () => void
  flush: () => Promise<void>
  cancel: () => void
  destroy: () => void
}

export function createAutoSaver({
  debounceMs = 1500,
  idleTimeout = 2000,
  onSave,
  onError = console.error,
}: AutoSaverOptions): AutoSaver {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let isSaving = false

  const performSave = async () => {
    if (isSaving) return
    isSaving = true
    try {
      await onSave()
    } catch (err) {
      onError(err)
    } finally {
      isSaving = false
    }
  }

  const idleSave = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => performSave(), { timeout: idleTimeout })
    } else {
      setTimeout(() => performSave(), 0)
    }
  }

  const schedule = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(idleSave, debounceMs)
  }

  const cancel = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  const flush = async () => {
    cancel()
    await performSave()
  }

  const destroy = () => {
    cancel()
  }

  return { schedule, flush, cancel, destroy }
}
