import React, { useState, useEffect } from 'react'
import type { AtelierMediaModel } from '../hooks/useAtelierMedia'
import AtelierCreationModeButtons from '../components/AtelierCreationModeButtons'
import type { AtelierCreationSelection, AtelierCreationType } from '../components/AtelierCreationModeButtons'

export function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.3L12 17l-6.2 4 2.4-7.3L2 9.2h7.6z" />
    </svg>
  )
}

export function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

export function Step({ index, label, done, locked, children }: {
  index: number
  label: string
  done?: boolean
  locked?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={[
          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-colors',
          done
            ? 'bg-[#facc15] text-black'
            : locked
              ? 'bg-white/[0.05] text-white/20'
              : 'bg-white/[0.08] text-white/40',
        ].join(' ')}>
          {done ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : index}
        </div>
        <span className={['text-[11px] font-medium uppercase tracking-widest transition-colors', locked ? 'text-white/20' : 'text-white/50'].join(' ')}>
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

export function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

export function FileIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(250,204,21,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

export function formatAtelierProjectDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
}

export function AtelierModelIcon({ model }: { model?: AtelierMediaModel }) {
  const icon = getAtelierModelIcon(model)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [icon.url])

  if (icon.url && !failed) {
    return (
      <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/[0.12] bg-white">
        <img
          src={icon.url}
          alt=""
          className="h-5 w-5 object-contain"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }

  return (
    <span className="flex h-6 min-w-6 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.07] px-1.5 text-[9px] font-bold text-white/72">
      {icon.fallback.slice(0, 3)}
    </span>
  )
}

export function getAtelierModelIcon(model?: AtelierMediaModel): { url?: string; fallback: string } {
  const provider = getAtelierModelProvider(model)
  const fallback = getAtelierModelFallback(model, provider)
  const directDomain = {
    openai: 'chatgpt.com',
    anthropic: 'claude.ai',
    google: 'gemini.google.com',
    meta: 'meta.ai',
    mistral: 'mistral.ai',
    deepseek: 'deepseek.com',
    qwen: 'chat.qwen.ai',
    xai: 'x.ai',
    zai: 'chat.z.ai',
    openrouter: 'openrouter.ai',
  }[provider]
  const modelSlug = getAtelierModelSlug(model)
  const slugDomain = modelSlug ? getAtelierProviderDomain(modelSlug) : undefined
  const domain = directDomain ?? slugDomain
  return {
    url: domain ? `https://www.google.com/s2/favicons?sz=64&domain_url=https://${domain}` : undefined,
    fallback,
  }
}

export function getAtelierModelSlug(model?: AtelierMediaModel): string {
  const modelId = model?.model || model?.id || ''
  const first = modelId.split('/')[0]?.toLowerCase() ?? ''
  return first.replace(/[^a-z0-9.-]/g, '')
}

export function getAtelierProviderDomain(slug: string): string | undefined {
  const domains: Record<string, string> = {
    alibaba: 'qwen.ai',
    amazon: 'aws.amazon.com',
    baidu: 'baidu.com',
    cohere: 'cohere.com',
    deepseek: 'deepseek.com',
    google: 'gemini.google.com',
    groq: 'groq.com',
    meta: 'meta.ai',
    'meta-llama': 'meta.ai',
    microsoft: 'microsoft.com',
    mistral: 'mistral.ai',
    moonshotai: 'moonshot.ai',
    nousresearch: 'nousresearch.com',
    openai: 'chatgpt.com',
    openrouter: 'openrouter.ai',
    perplexity: 'perplexity.ai',
    qwen: 'chat.qwen.ai',
    rekaai: 'reka.ai',
    stabilityai: 'stability.ai',
    'stability-ai': 'stability.ai',
    'black-forest-labs': 'blackforestlabs.ai',
    'ideogram-ai': 'ideogram.ai',
    ideogram: 'ideogram.ai',
    nanobanana: 'openrouter.ai',
    'recraft-ai': 'recraft.ai',
    luma: 'lumalabs.ai',
    minimax: 'minimaxi.com',
    'wan-ai': 'wanvideo.net',
    runway: 'runwayml.com',
    kling: 'klingai.com',
    pika: 'pika.art',
    xai: 'x.ai',
    'x-ai': 'x.ai',
    zhipuai: 'z.ai',
  }
  return domains[slug]
}

export function getAtelierModelFallback(model: AtelierMediaModel | undefined, provider: string): string {
  const modelName = (model?.model || model?.label || provider || 'AI')
    .split('/')
    .pop()
    ?.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    ?? 'AI'
  const compact = modelName.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase()
  return compact || 'AI'
}

export function getAtelierModelProvider(model?: AtelierMediaModel): string {
  const value = `${model?.id ?? ''} ${model?.model ?? ''} ${model?.label ?? ''}`.toLowerCase()
  if (value.includes('openrouter')) return 'openrouter'
  if (value.includes('openai/') || value.includes('gpt') || value.includes('chatgpt')) return 'openai'
  if (value.includes('anthropic/') || value.includes('claude')) return 'anthropic'
  if (value.includes('google/') || value.includes('gemini') || value.includes('imagen')) return 'google'
  if (value.includes('meta-llama') || value.includes('llama')) return 'meta'
  if (value.includes('mistral')) return 'mistral'
  if (value.includes('deepseek')) return 'deepseek'
  if (value.includes('qwen')) return 'qwen'
  if (value.includes('x-ai/') || value.includes('grok')) return 'xai'
  if (value.includes('z-ai/') || value.includes('glm')) return 'zai'
  return 'generic'
}

export function MenuTinyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

export function CloseTinyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function AtelierModeChip({
  icon,
  label,
  onClear,
}: {
  icon?: React.ReactNode
  label: string
  onClear: () => void
}) {
  return (
    <span className="flex min-w-0 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-sm text-white/75">
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#facc15]">
        {icon}
      </span>
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onClear()
        }}
        className="-mr-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/[0.08] hover:text-white/80"
        aria-label={`${label} sluiten`}
        title={`${label} sluiten`}
      >
        <span className="scale-[0.58]">
          <CloseTinyIcon />
        </span>
      </button>
    </span>
  )
}

export function PlusTinyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function SearchTinyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function TrashTinyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

export function VideoTinyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M17 9l4-2v10l-4-2" />
    </svg>
  )
}

export function AtelierSaveImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function AtelierExpandImageIcon() {
  return (
    <span className="pointer-events-none absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.14] bg-black/35 text-white/70 opacity-0 shadow-lg backdrop-blur-md transition-opacity group-hover:opacity-100">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M16 3h3a2 2 0 0 1 2 2v3" />
        <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    </span>
  )
}

export function AtelierCreationSidebar({
  activeType,
  onSelect,
}: {
  activeType: AtelierCreationSelection
  onSelect: (type: AtelierCreationType) => void
}) {
  return (
    <nav className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 bg-transparent">
      <AtelierCreationModeButtons activeType={activeType} onSelect={onSelect} />
    </nav>
  )
}
