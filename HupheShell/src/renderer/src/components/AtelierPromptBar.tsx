import React, { useRef, useState } from 'react'
import type { AtelierMediaModel } from '../hooks/useAtelierMedia'
import { AtelierModelPickerButton } from './AtelierModelPickerButton'

export function AtelierPromptBar({
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
}: {
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
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const trimmed = value.trim()
  const isDisabled = disabled || loading

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!trimmed || isDisabled) return
    const prompt = trimmed
    setValue('')
    requestAnimationFrame(() => inputRef.current?.focus())
    void onSubmit(prompt)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-center gap-2 rounded-[2rem] border border-white/[0.05] bg-[#1e1e1e] pl-4 pr-2 shadow-sm transition-[border-color] duration-300 focus-within:border-white/[0.15]"
      style={{ height: 48 }}
    >
      {leading}
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={loading && busyPlaceholder ? busyPlaceholder : placeholder}
        disabled={isDisabled}
        className="min-w-0 flex-1 border-none bg-transparent text-sm text-white outline-none placeholder:text-white/40 disabled:opacity-60"
      />
      {trailing}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {models && selectedModelId !== undefined && onModelSelect && (
          <AtelierModelPickerButton
            models={models}
            selectedModelId={selectedModelId}
            loading={modelsLoading}
            dropdownPosition={dropdownPosition}
            onSelect={onModelSelect}
          />
        )}
        <button
          type="submit"
          disabled={isDisabled || !trimmed}
          className={[
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
            loading ? 'bg-white/[0.08] text-white/40' : trimmed ? 'bg-white text-black' : 'bg-white/[0.05] text-white/20',
          ].join(' ')}
          aria-label="Verzenden"
        >
          {loading ? (
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </form>
  )
}
