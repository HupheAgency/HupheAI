import { useEffect, useRef, useState, type ReactNode } from 'react'
import AtelierCreationModeButtons, {
  ATELIER_CREATION_OPTIONS,
  type AtelierCreationType,
} from './AtelierCreationModeButtons'
import AtelierRightPanel, { type AtelierProjectsPanelConfig } from './AtelierRightPanel'
import { AtelierModeChip, PlusTinyIcon } from './AtelierSharedUI'
import type { AtelierMediaModel } from '../hooks/useAtelierMedia'
import { AtelierPromptBar } from './AtelierPromptBar'
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
  const [isWaiting, setIsWaiting] = useState(false)
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
          <div className={hasPromptChat ? 'mx-auto w-full max-w-3xl' : 'w-full'}>
            <AtelierPromptBar
              placeholder={inputPlaceholder.replace(/…/g, '...')}
              busyPlaceholder="Atelier denkt na..."
              loading={isWaiting}
              disabled={isWaiting}
              models={chatModels}
              selectedModelId={chatSelectedModelId}
              modelsLoading={chatModelsLoading}
              dropdownPosition={hasPromptChat ? 'top' : 'bottom'}
              onModelSelect={(id) => onChatModelSelect?.(id)}
              onSubmit={(prompt) => {
                const result = onPromptSubmit?.(prompt)
                if (result instanceof Promise) {
                  setIsWaiting(true)
                  result.finally(() => setIsWaiting(false))
                }
              }}
              leading={(
                <div className="flex min-w-0 items-center gap-2">
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
              </div>
              )}
            />
          </div>
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
