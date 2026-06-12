import { useEffect, useRef, useState, type ReactNode } from 'react'
import AtelierCreationModeButtons, {
  ATELIER_CREATION_OPTIONS,
  type AtelierCreationType,
} from './AtelierCreationModeButtons'
import AtelierRightPanel, { type AtelierProjectsPanelConfig } from './AtelierRightPanel'
import { AtelierModeChip, PlusTinyIcon } from './AtelierSharedUI'
import type { AtelierMediaModel } from '../hooks/useAtelierMedia'
import { AtelierModelPickerButton } from './AtelierModelPickerButton'
import spinnerSrc from '../assets/spinner.png'

export default function AtelierSetupShell({
  type,
  inputPlaceholder,
  children,
  onCreationTypeSelect,
  onClearCreationType,
  onPromptSubmit,
  promptMessages = [],
  projectsPanel,
  chatModels = [],
  chatModelsLoading = false,
  chatSelectedModelId = '',
  onChatModelSelect,
  convertContent,
}: {
  type: AtelierCreationType
  inputPlaceholder: string
  children: ReactNode
  onCreationTypeSelect?: (type: AtelierCreationType) => void
  onClearCreationType?: () => void
  onPromptSubmit?: (prompt: string) => void | Promise<void>
  promptMessages?: Array<{ role: 'user' | 'assistant'; content: string; model?: string }>
  projectsPanel?: AtelierProjectsPanelConfig
  chatModels?: AtelierMediaModel[]
  chatModelsLoading?: boolean
  chatSelectedModelId?: string
  onChatModelSelect?: (id: string) => void
  convertContent?: ReactNode
}) {
  const option = ATELIER_CREATION_OPTIONS.find((item) => item.id === type) ?? ATELIER_CREATION_OPTIONS[0]
  const [promptValue, setPromptValue] = useState('')
  const [isWaiting, setIsWaiting] = useState(false)
  const promptInputRef = useRef<HTMLInputElement>(null)
  const promptScrollRef = useRef<HTMLDivElement>(null)
  const hasPromptChat = promptMessages.length > 0

  useEffect(() => {
    const scrollEl = promptScrollRef.current
    if (!scrollEl) return
    requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight
    })
  }, [promptMessages.length, isWaiting])

  return (
    <div className="relative z-10 flex h-full w-full overflow-hidden">
      <section
        className={[
          'relative flex min-w-0 flex-1 justify-center px-6',
          hasPromptChat ? 'items-stretch pb-8 pt-8' : 'items-center',
        ].join(' ')}
      >
        <div className={hasPromptChat ? 'flex h-full min-h-0 w-full flex-col' : 'w-full max-w-3xl px-8'}>
          {!hasPromptChat && (
            <h1 className="mb-8 text-center text-2xl font-medium tracking-tight text-white/90 sm:text-3xl">
              Let's huphefy some stuff.
            </h1>
          )}
          {hasPromptChat && (
            <div ref={promptScrollRef} className="min-h-0 flex-1 overflow-y-auto pb-4 pt-6">
              <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-3 px-8">
              {promptMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={[
                      'max-w-[78%] rounded-2xl px-4 py-3 text-left shadow-lg',
                      message.role === 'user'
                        ? 'rounded-tr-md bg-white text-black'
                        : 'rounded-tl-md border border-white/[0.07] bg-[#1c1c1c]/95',
                    ].join(' ')}
                  >
                    {message.role === 'assistant' && (
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#facc15]/80">
                        Atelier{message.model ? ` · ${message.model}` : ''}
                      </p>
                    )}
                    <p className={['text-sm leading-relaxed', message.role === 'user' ? 'text-black' : 'text-white/68'].join(' ')}>
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}
              {isWaiting && <AtelierThinkingBubble />}
              </div>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const prompt = promptValue.trim()
              if (prompt && !isWaiting) {
                setPromptValue('')
                requestAnimationFrame(() => promptInputRef.current?.focus())
                const result = onPromptSubmit?.(prompt)
                if (result instanceof Promise) {
                  setIsWaiting(true)
                  result.finally(() => {
                    setIsWaiting(false)
                    requestAnimationFrame(() => promptInputRef.current?.focus())
                  })
                }
              }
            }}
            className={[
              'flex w-full flex-col gap-2 rounded-[2rem] border border-white/[0.05] bg-[#1e1e1e] px-4 py-3 text-left shadow-sm transition-[border-color] duration-300 focus-within:border-white/[0.15]',
              hasPromptChat ? 'mx-auto max-w-3xl' : '',
            ].join(' ')}
          >
            <input
              ref={promptInputRef}
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              placeholder={isWaiting ? 'Atelier denkt na…' : inputPlaceholder}
              className="h-10 w-full min-w-0 border-none bg-transparent px-3 text-base text-white outline-none placeholder:text-white/40"
            />
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
                aria-label="Toevoegen"
                title="Toevoegen"
              >
                <PlusTinyIcon />
              </button>
              {!hasPromptChat && (
                <>
                  {onClearCreationType ? (
                    <AtelierModeChip
                      icon={option.icon}
                      label={option.label}
                      onClear={onClearCreationType}
                    />
                  ) : (
                    <span className="flex min-w-0 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-sm text-white/75">
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#facc15]">{option.icon}</span>
                      <span className="truncate">{option.label}</span>
                    </span>
                  )}
                </>
              )}
              <div className="ml-auto flex flex-shrink-0 items-center gap-2">
                <AtelierModelPickerButton
                  models={chatModels}
                  selectedModelId={chatSelectedModelId}
                  loading={chatModelsLoading}
                  dropdownPosition={hasPromptChat ? 'top' : 'bottom'}
                  onSelect={(id) => onChatModelSelect?.(id)}
                />

                <button
                  type="submit"
                  disabled={isWaiting || !promptValue.trim()}
                  className={[
                    'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
                    isWaiting ? 'bg-white/[0.08] text-white/40' : promptValue.trim() ? 'bg-white text-black' : 'bg-white/[0.05] text-white/20',
                  ].join(' ')}
                  aria-label="Verzenden"
                >
                  {isWaiting ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </form>
          {!hasPromptChat && onCreationTypeSelect && (
            <AtelierCreationModeButtons
              activeType={type}
              onSelect={onCreationTypeSelect}
              className="mt-4"
            />
          )}
        </div>
      </section>
      <AtelierRightPanel projectsPanel={projectsPanel} convertContent={convertContent}>
        {children}
      </AtelierRightPanel>
    </div>
  )
}

export function AtelierThinkingBubble() {
  const [dots, setDots] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex w-full justify-start">
      <div className="flex items-center gap-3 px-1 py-2">
        <style>{`
          @keyframes huphe-spin {
            0%   { transform: rotate(0deg); }
            45%  { transform: rotate(180deg); }
            65%  { transform: rotate(180deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <img
          src={spinnerSrc}
          alt=""
          style={{ width: 22, height: 22, animation: 'huphe-spin 1.2s ease-in-out infinite' }}
        />
        <span className="text-sm text-white/40">
          {'Thinking' + '.'.repeat(dots)}
        </span>
      </div>
    </div>
  )
}
