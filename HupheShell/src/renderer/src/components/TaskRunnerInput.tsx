import { useState } from 'react'

export interface AgentOption {
  id: string
  label: string
}

interface Props {
  agents: AgentOption[]
  coordinatorAgentId: string
  workerAgentIds: string[]
  onChangeCoordinator: (id: string) => void
  onToggleWorker: (id: string) => void
  onRunTask: (task: string) => void
  running?: boolean
}

export default function TaskRunnerInput({
  agents,
  coordinatorAgentId,
  workerAgentIds,
  onChangeCoordinator,
  onToggleWorker,
  onRunTask,
  running = false,
}: Props) {
  const [task, setTask] = useState('')
  const trimmedTask = task.trim()
  const canRun = trimmedTask.length > 0 && !running

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canRun) return
    onRunTask(trimmedTask)
    setTask('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#111] border border-white/[0.07] rounded-2xl p-4 mb-3 text-white"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-white/50 text-xs uppercase tracking-wider font-medium">Multi-agent taak</p>
        {workerAgentIds.length > 0 && (
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-white/35 text-xs">
            {workerAgentIds.length} ingezet
          </span>
        )}
      </div>

      <textarea
        value={task}
        onChange={(event) => setTask(event.target.value)}
        placeholder="Beschrijf de taak..."
        rows={3}
        disabled={running}
        className="mt-3 min-h-[76px] max-h-32 w-full resize-y rounded-xl border border-white/[0.07] bg-[#0a0a0a] px-3.5 py-3 text-white text-sm leading-relaxed outline-none transition-colors placeholder:text-white/25 focus:border-white/15 disabled:cursor-not-allowed disabled:opacity-50"
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr]">
        <label className="block">
          <span className="block text-white/40 text-xs mb-2">Coördinator</span>
          <select
            value={coordinatorAgentId}
            onChange={(event) => onChangeCoordinator(event.target.value)}
            disabled={running || agents.length === 0}
            className="w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a] px-3 py-2.5 text-white/70 text-sm outline-none transition-colors focus:border-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {agents.length === 0 ? (
              <option value="">Geen agents</option>
            ) : (
              agents.map((agent) => (
                <option key={agent.id} value={agent.id} className="bg-[#111] text-white">
                  {agent.label}
                </option>
              ))
            )}
          </select>
        </label>

        <div>
          <span className="block text-white/40 text-xs mb-2">Inzetten</span>
          <div className="flex flex-wrap gap-2">
            {agents.length === 0 ? (
              <span className="text-white/25 text-sm py-2">Geen agents beschikbaar</span>
            ) : (
              agents.map((agent) => {
                const selected = workerAgentIds.includes(agent.id)
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onToggleWorker(agent.id)}
                    disabled={running}
                    className={[
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      selected
                        ? 'bg-[#facc15] border-[#facc15] text-black'
                        : 'bg-white/[0.03] border-white/[0.07] text-white/45 hover:text-white/70 hover:border-white/15',
                    ].join(' ')}
                  >
                    {agent.label}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canRun}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#facc15] px-4 py-3 text-black text-sm font-semibold transition-colors hover:bg-[#fde047] active:bg-[#eab308] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/25"
      >
        {running && <Spinner />}
        {running ? 'Bezig...' : 'Start taak →'}
      </button>
    </form>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
