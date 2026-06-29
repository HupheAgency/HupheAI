import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { AtelierMediaModel } from '../hooks/useAtelierMedia'
import { AtelierModelPickerButton } from './AtelierModelPickerButton'

export interface AtelierPromptBarHandle {
  getValue: () => string
  clearValue: () => void
}

export type PromptBarMode = 'capture' | 'retry' | 'locked'

const CameraIcon = ({ size = 18, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <circle cx="8" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M5.5 2.5h5l1 2h2a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-7a1 1 0 011-1h2l1-2z" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
)

const RetryIcon = ({ size = 18, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
)

const LockClosedIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
)

const LockOpenIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 015-5 5 5 0 015 5" />
  </svg>
)

export const AtelierPromptBar = forwardRef<AtelierPromptBarHandle, {
  placeholder?: string
  busyPlaceholder?: string
  disabled?: boolean
  loading?: boolean
  models?: AtelierMediaModel[]
  selectedModelId?: string
  modelsLoading?: boolean
  dropdownPosition?: 'top' | 'bottom'
  leading?: React.ReactNode
  trailing?: React.ReactNode
  onModelSelect?: (id: string) => void
  onSubmit: (prompt: string) => void | Promise<void>
  mode?: PromptBarMode
  onToggleLock?: () => void
}>(function AtelierPromptBarInner({
  placeholder = 'Beschrijf wat je wilt maken...',
  busyPlaceholder,
  disabled = false,
  loading = false,
  models,
  selectedModelId,
  modelsLoading,
  dropdownPosition = 'top',
  leading,
  trailing,
  onModelSelect,
  onSubmit,
  mode = 'capture',
  onToggleLock,
}, ref) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const trimmed = value.trim()
  const isLocked = mode === 'locked'
  const promptDisabled = disabled || loading || isLocked
  const submitDisabled = loading || (isLocked || mode === 'retry' ? false : !trimmed)

  useImperativeHandle(ref, () => ({
    getValue: () => value.trim(),
    clearValue: () => setValue(''),
  }), [value])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    if (isLocked || (mode === 'retry' && !trimmed)) {
      void onSubmit('')
      return
    }
    if (!trimmed) return
    const prompt = trimmed
    setValue('')
    requestAnimationFrame(() => inputRef.current?.focus())
    void onSubmit(prompt)
  }

  const actionIcon = (() => {
    if (loading) return <CameraIcon className="animate-pulse" />
    if (isLocked) return <CameraIcon />
    if (mode === 'retry') return <RetryIcon />
    return <CameraIcon />
  })()

  const actionLabel = (() => {
    if (isLocked) return 'Maak foto (zelfde achtergrond)'
    if (mode === 'retry') return 'Andere achtergrond genereren'
    return 'Maak foto'
  })()

  const actionActive = (() => {
    if (loading) return false
    if (isLocked) return true
    if (mode === 'retry') return true
    return !!trimmed
  })()

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-center gap-2 rounded-[2rem] border border-white/[0.05] bg-[#1e1e1e] pl-4 pr-1 shadow-sm transition-[border-color] duration-300 focus-within:border-white/[0.15]"
      style={{ height: 48 }}
    >
      {leading}
      <input
        ref={inputRef}
        value={isLocked ? '' : value}
        onChange={(event) => { if (!isLocked) setValue(event.target.value) }}
        placeholder={
          loading && busyPlaceholder ? busyPlaceholder
          : isLocked ? 'Achtergrond vergrendeld — nieuwe hoek'
          : mode === 'retry' ? 'Andere achtergrond of druk op herhaal...'
          : placeholder
        }
        disabled={promptDisabled}
        className="min-w-0 flex-1 border-none bg-transparent text-sm text-white outline-none placeholder:text-white/40 disabled:opacity-60"
      />
      {trailing}
      <div className="flex flex-shrink-0 items-center gap-1">
        {models && selectedModelId !== undefined && onModelSelect && (
          <AtelierModelPickerButton
            models={models}
            selectedModelId={selectedModelId}
            loading={modelsLoading}
            dropdownPosition={dropdownPosition}
            onSelect={onModelSelect}
          />
        )}
        {mode !== 'capture' && onToggleLock ? (
          <div
            className="relative flex h-10 w-20 flex-shrink-0 cursor-pointer items-center rounded-full bg-white/[0.05]"
            onClick={(e) => { e.preventDefault(); onToggleLock() }}
            title={isLocked ? 'Achtergrond ontgrendelen' : 'Achtergrond vergrendelen'}
          >
            {/* Background icons — fixed position, visible when not covered by ball */}
            <div className="absolute left-0 flex h-10 w-10 items-center justify-center text-white/20">
              <RetryIcon size={16} />
            </div>
            <div className="absolute right-0 flex h-10 w-10 items-center justify-center text-white/20">
              <LockClosedIcon />
            </div>
            {/* Sliding yellow ball with camera icon */}
            <button
              type="submit"
              disabled={submitDisabled}
              onClick={(e) => e.stopPropagation()}
              className="absolute z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#facc15] text-black shadow-lg transition-transform duration-200 active:scale-95"
              style={{ transform: isLocked ? 'translateX(100%)' : 'translateX(0)' }}
              aria-label={actionLabel}
            >
              <CameraIcon />
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={submitDisabled}
            className={[
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-all active:scale-95',
              loading ? 'bg-[#facc15]/40 text-black/40'
              : actionActive ? 'bg-[#facc15] text-black shadow-lg hover:bg-[#fde047]'
              : 'bg-white/[0.05] text-white/20',
            ].join(' ')}
            aria-label={actionLabel}
            title={actionLabel}
          >
            {actionIcon}
          </button>
        )}
      </div>
    </form>
  )
})
