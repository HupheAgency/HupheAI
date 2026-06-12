import { useEffect, type ChangeEvent, type DragEvent, type ReactNode, type RefObject } from 'react'

type Mode = 'manual' | 'ai'

interface Client {
  id: string
  name: string
}

interface HtmlTemplateOption {
  clientId: string
  name: string
  source: 'system' | 'admin'
}

interface AtelierUploadFlowProps {
  file: File | null
  isDragging: boolean
  fileError: string
  keyImportError: string
  analyseError: string
  analysing: boolean
  importingKey: boolean
  textMode: Mode | null
  imageMode: Mode | null
  templateClientId: string
  clients: Client[]
  htmlTemplates?: HtmlTemplateOption[]
  clientsLoading: boolean
  templateClientIds: Set<string>
  embedded?: boolean
  uploadFileRef: RefObject<HTMLInputElement>

  onUploadInputChange: (e: ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onTextModeSelect: (mode: Mode) => void
  onImageModeSelect: (mode: Mode) => void
  onClientSelect: (clientId: string) => void
  onAnalyse: () => void
  onBlankCanvas: () => void
}

function fileExtension(file: File | null): string {
  return file ? `.${file.name.split('.').pop()?.toLowerCase() ?? ''}` : ''
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function Step({ index, label, done, locked, children }: {
  index: number
  label: string
  done?: boolean
  locked?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={[
          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-colors',
          done ? 'bg-[#facc15] text-black' : locked ? 'bg-white/[0.05] text-white/20' : 'bg-white/[0.08] text-white/40',
        ].join(' ')}>
          {done ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : index}
        </div>
        <span className={['text-[11px] font-medium uppercase tracking-widest transition-colors', locked ? 'text-white/20' : 'text-white/50'].join(' ')}>{label}</span>
      </div>
      {children}
    </div>
  )
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

function FileIcon() {
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

function TextManualIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function AiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      <path d="M19 3v4" />
      <path d="M21 5h-4" />
    </svg>
  )
}

function ImageManualIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function OptionButton({
  selected,
  disabled,
  label,
  description,
  icon,
  onClick,
}: {
  selected: boolean
  disabled?: boolean
  label: string
  description: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex flex-col items-start gap-2.5 rounded-xl p-3.5 text-left border transition-colors',
        selected
          ? 'bg-[#facc15]/[0.06] border-[#facc15]/40'
          : 'bg-[#141414] border-white/[0.07] hover:border-white/[0.14]',
        disabled ? 'cursor-not-allowed' : '',
      ].join(' ')}
    >
      <span className={selected ? 'text-[#facc15]' : 'text-white/30'}>{icon}</span>
      <div>
        <p className={['text-xs font-medium leading-snug', selected ? 'text-white' : 'text-white/60'].join(' ')}>
          {label}
        </p>
        <p className="text-white/25 text-[11px] leading-snug mt-0.5">{description}</p>
      </div>
    </button>
  )
}

function HiddenUploadInput({
  uploadFileRef,
  onUploadInputChange,
}: Pick<AtelierUploadFlowProps, 'uploadFileRef' | 'onUploadInputChange'>) {
  return (
    <input
      ref={uploadFileRef}
      type="file"
      accept=".txt,.md,.docx,.key,.ppt,.pptx,.jpg,.jpeg,.png,.pdf"
      onChange={onUploadInputChange}
      className="sr-only"
      aria-hidden="true"
    />
  )
}

export default function AtelierUploadFlow({
  file,
  isDragging,
  fileError,
  keyImportError,
  analyseError,
  analysing,
  importingKey,
  textMode,
  imageMode,
  templateClientId,
  clients,
  htmlTemplates = [],
  clientsLoading,
  templateClientIds,
  embedded,
  uploadFileRef,
  onUploadInputChange,
  onDrop,
  onDragOver,
  onDragLeave,
  onTextModeSelect,
  onImageModeSelect,
  onClientSelect,
  onAnalyse,
  onBlankCanvas,
}: AtelierUploadFlowProps) {
  const ext = fileExtension(file)
  const isPresentationFile = !!file && ['.key', '.ppt', '.pptx'].includes(ext)
  const isOcrFile = !!file && ['.jpg', '.jpeg', '.png', '.pdf'].includes(ext)
  const templateUnlocked = !!file
  const analyseUnlocked = templateUnlocked && !!templateClientId
  const clientsWithTemplate = clients.filter((client) => templateClientIds.has(client.id))
  const hasAnyTemplate = clientsWithTemplate.length > 0 || htmlTemplates.length > 0

  useEffect(() => {
    if (!file) return
    if (!isPresentationFile && !isOcrFile && textMode !== 'ai') onTextModeSelect('ai')
    if (!isOcrFile && imageMode !== 'manual') onImageModeSelect('manual')
  }, [file, isPresentationFile, isOcrFile, textMode, imageMode, onTextModeSelect, onImageModeSelect])

  return (
    <div className={[embedded ? 'h-full px-6 pb-7 pt-4' : 'flex-1 px-6 py-10', 'overflow-y-auto'].join(' ')}>
      <div className="w-full space-y-6">
        <div className="text-center space-y-1 mb-2">
          <h1 className="text-white font-semibold text-[18px]">Maak een deck in Atelier</h1>
          <p className="text-white/35 text-sm">Volg de stappen hieronder om te beginnen</p>
        </div>

        <Step index={1} label="Document" done={!!file}>
          <div
            role="button"
            tabIndex={0}
            aria-label="Dropzone voor document"
            onClick={() => uploadFileRef.current?.click()}
            onKeyDown={(event) => { if (event.key === 'Enter') uploadFileRef.current?.click() }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={[
              'flex flex-col items-center justify-center gap-3',
              'w-full h-36 rounded-xl border-2 border-dashed cursor-pointer',
              'outline-none focus-visible:ring-2 focus-visible:ring-[#facc15]/40 transition-colors',
              isDragging
                ? 'border-[#facc15] bg-[#facc15]/[0.04]'
                : file
                  ? 'border-[#facc15]/30 bg-[#141414]'
                  : 'border-white/[0.10] bg-[#141414] hover:border-white/20',
            ].join(' ')}
          >
            <HiddenUploadInput uploadFileRef={uploadFileRef} onUploadInputChange={onUploadInputChange} />
            {importingKey ? (
              <div className="text-center space-y-2">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mx-auto" />
                <p className="text-white/55 text-sm">Keynote openen...</p>
                <p className="text-white/30 text-xs">Dit kan even duren</p>
              </div>
            ) : file ? (
              <>
                <FileIcon />
                <div className="text-center">
                  <p className="text-white text-sm font-medium">{file.name}</p>
                  <p className="text-white/30 text-xs mt-0.5">{formatBytes(file.size)}</p>
                </div>
                <p className="text-white/25 text-xs">Klik of sleep om te vervangen</p>
              </>
            ) : (
              <>
                <UploadIcon />
                <div className="text-center">
                  <p className="text-white/55 text-sm">Sleep een bestand hierheen</p>
                  <p className="text-white/30 text-xs mt-1">.txt · .md · .docx · .key · .pptx</p>
                </div>
              </>
            )}
          </div>
          {(fileError || keyImportError) && (
            <p className="text-red-400 text-xs mt-2 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5">
              {fileError || keyImportError}
            </p>
          )}
        </Step>

        <Step index={2} label="Template" done={!!templateClientId} locked={!templateUnlocked}>
          <div className={['relative transition-opacity', !templateUnlocked ? 'opacity-30 pointer-events-none select-none' : ''].join(' ')}>
            <select
              id="template-select"
              value={templateClientId}
              onChange={(event) => onClientSelect(event.target.value)}
              disabled={!templateUnlocked}
              className={[
                'w-full appearance-none bg-[#141414] border rounded-lg px-4 py-2.5',
                'text-sm transition-colors outline-none cursor-pointer',
                'focus:border-[#facc15]/50 focus:ring-1 focus:ring-[#facc15]/20',
                templateClientId ? 'text-white border-white/[0.08]' : 'text-white/30 border-white/[0.08]',
              ].join(' ')}
            >
              <option value="" disabled>
                {clientsLoading ? 'Laden...' : !hasAnyTemplate ? 'Geen templates beschikbaar' : 'Kies een template...'}
              </option>
              {clientsWithTemplate.map((client) => (
                <option key={client.id} value={client.id} className="text-white bg-[#1a1a1a]">{client.name}</option>
              ))}
              {htmlTemplates.length > 0 && (
                <optgroup label="Huphe templates">
                  {htmlTemplates.map((template) => (
                    <option key={template.clientId} value={template.clientId} className="text-white bg-[#1a1a1a]">
                      {template.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </Step>

        <div className={['transition-opacity', !analyseUnlocked ? 'opacity-30' : ''].join(' ')}>
          <button
            type="button"
            onClick={onAnalyse}
            disabled={!analyseUnlocked || analysing}
            className="w-full font-semibold rounded-lg px-4 py-3 text-sm transition-colors bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:cursor-not-allowed text-black"
          >
            {analysing ? 'Laden...' : 'Maken'}
          </button>
        </div>

        {analyseError && (
          <p className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5">
            {analyseError}
          </p>
        )}
      </div>
    </div>
  )
}
