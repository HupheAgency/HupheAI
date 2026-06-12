import { useRef, useState } from 'react'

export interface PrintFunnelStepProps {
  onComplete: (payload: PrintFunnelPayload) => void
  initialPayload?: PrintFunnelPayload
}

export interface PrintFunnelPayload {
  title: string
  body: string
  imageSrc?: string
  format: 'A4' | 'A5' | 'A3' | 'SRA3' | 'DL'
}

const PRINT_FORMATS: PrintFunnelPayload['format'][] = ['A4', 'A5', 'A3', 'SRA3', 'DL']

export default function PrintFunnelStep({ onComplete, initialPayload }: PrintFunnelStepProps) {
  const [format, setFormat] = useState<PrintFunnelPayload['format']>(initialPayload?.format ?? 'A4')
  const [title, setTitle] = useState(initialPayload?.title ?? '')
  const [body, setBody] = useState(initialPayload?.body ?? '')
  const [imageSrc, setImageSrc] = useState(initialPayload?.imageSrc ?? '')
  const [imageFileName, setImageFileName] = useState('')
  const [imageDragging, setImageDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canGenerate = title.trim().length > 0

  function readImageFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string)
      setImageFileName(file.name)
    }
    reader.readAsDataURL(file)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setImageDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) readImageFile(file)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canGenerate) return
    onComplete({
      title: title.trim(),
      body: body.trim(),
      imageSrc: imageSrc || undefined,
      format,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6 py-10"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/[0.07] bg-[#141414]/90 p-5 shadow-2xl">
        <div className="mb-5">
          <p className="text-sm font-semibold text-white">Print maken</p>
          <p className="mt-1 text-xs leading-relaxed text-white/50">
            Kies een formaat, voeg tekst toe en upload optioneel een beeld.
          </p>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {PRINT_FORMATS.map((item) => {
            const selected = item === format
            return (
              <button
                key={item}
                type="button"
                onClick={() => setFormat(item)}
                className={[
                  'h-9 rounded-full border px-4 text-xs font-semibold transition-colors',
                  selected
                    ? 'border-[#facc15] bg-[#facc15] text-black'
                    : 'border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/15 hover:text-white',
                ].join(' ')}
              >
                {item}
              </button>
            )
          })}
        </div>

        <div className="space-y-3">
          <textarea
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            rows={1}
            placeholder="Titel"
            className="w-full resize-none rounded-xl border border-white/[0.07] bg-[#0f0f0f] px-4 py-3 text-xl font-semibold leading-tight text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#facc15]/40"
          />

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder="Bodytekst..."
            className="w-full resize-none rounded-xl border border-white/[0.07] bg-[#0f0f0f] px-4 py-3 text-sm leading-relaxed text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-[#facc15]/40"
          />
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setImageDragging(true)
            }}
            onDragLeave={() => setImageDragging(false)}
            onDrop={handleDrop}
            className={[
              'relative flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors',
              imageDragging
                ? 'border-[#facc15] bg-[#facc15]/[0.04]'
                : 'border-white/[0.10] bg-[#0f0f0f] hover:border-white/20',
            ].join(' ')}
          >
            {imageSrc ? (
              <>
                <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
                <span className="relative flex flex-col items-center gap-1 rounded-xl bg-black/40 px-3 py-2 text-center backdrop-blur-md">
                  <span className="text-xs font-semibold text-white/85">{imageFileName || 'Afbeelding geladen'}</span>
                  <span className="text-[11px] text-white/45">Klik of sleep om te vervangen</span>
                </span>
              </>
            ) : (
              <span className="flex flex-col items-center gap-2 text-center text-white/30">
                <ImageIcon />
                <span className="text-sm text-white/45">Sleep een afbeelding hierheen</span>
                <span className="text-xs text-white/25">PNG, JPG of WebP</span>
              </span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) readImageFile(file)
              event.currentTarget.value = ''
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!canGenerate}
          className={[
            'mt-5 flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition-colors',
            canGenerate
              ? 'bg-[#facc15] text-black hover:bg-[#fde047] active:bg-[#eab308]'
              : 'cursor-not-allowed bg-white/[0.06] text-white/25',
          ].join(' ')}
        >
          Genereer
        </button>
      </div>
    </form>
  )
}

function ImageIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}
