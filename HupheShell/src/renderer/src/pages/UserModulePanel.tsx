import { Toggle } from '../components/Toggle'

interface Module {
  id: string
  slug: string
  label: string
  description: string
}

interface Props {
  modules: Module[]
  enabledModuleIds: Set<string>
  onToggle: (moduleId: string, enabled: boolean) => void
  saving: string | null
}

export default function UserModulePanel({
  modules,
  enabledModuleIds,
  onToggle,
  saving,
}: Props) {
  return (
    <section className="bg-[#141414] border border-white/[0.07] rounded-2xl p-5">
      <style>{`
        @keyframes huphe-module-dot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.75); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="min-w-0">
          <p className="text-white/50 text-xs uppercase tracking-widest">
            Module-toegang
          </p>
          <p className="text-white/25 text-xs mt-1">
            Wijzigingen worden direct opgeslagen.
          </p>
        </div>
      </div>

      {modules.length === 0 ? (
        <div className="border border-white/[0.07] rounded-xl bg-[#0d0d0d] px-4 py-4">
          <p className="text-white/35 text-sm">Geen modules gevonden.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {modules.map((module) => {
            const enabled = enabledModuleIds.has(module.id)
            const isSaving = saving === module.id

            return (
              <div key={module.id} className="flex items-center justify-between gap-4 py-4 first:pt-1 last:pb-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-medium truncate">
                      {module.label}
                    </p>
                    <span className="text-white/25 text-[10px] font-mono truncate">
                      {module.slug}
                    </span>
                  </div>
                  <p className="text-white/35 text-xs leading-relaxed mt-1">
                    {module.description}
                  </p>
                </div>

                <div className="w-11 h-6 flex-shrink-0 flex items-center justify-center">
                  {isSaving ? (
                    <div className="flex items-center justify-center gap-1" aria-label="Opslaan">
                      {[0, 1, 2].map((index) => (
                        <span
                          key={index}
                          className="w-1.5 h-1.5 rounded-full bg-[#facc15]"
                          style={{
                            animation: 'huphe-module-dot 900ms ease-in-out infinite',
                            animationDelay: `${index * 120}ms`,
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <Toggle
                      checked={enabled}
                      onChange={v => onToggle(module.id, v)}
                      disabled={saving !== null}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
