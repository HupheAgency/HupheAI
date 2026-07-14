import { Component, type ReactNode } from 'react'

interface ProductStudioBoundaryState {
  error: Error | null
}

export default class ProductStudioBoundary extends Component<{ children: ReactNode }, ProductStudioBoundaryState> {
  state: ProductStudioBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ProductStudioBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ProductStudio] crash boundary:', error)
    console.error('[ProductStudio] component stack:', info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-[#0a0a0a] p-6 text-white">
        <div className="max-w-lg rounded-lg border border-red-400/20 bg-red-500/[0.06] p-5 shadow-2xl">
          <p className="text-sm font-semibold text-red-200">Product Studio is vastgelopen</p>
          <p className="mt-2 text-sm leading-6 text-white/55">
            De rest van HupheAI blijft beschikbaar. De exacte fout staat nu in de console onder
            <span className="font-mono"> [ProductStudio] crash boundary</span>.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-black/30 p-3 text-[11px] leading-5 text-red-100/75">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/[0.08]"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }
}
