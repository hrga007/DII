import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-800">Došlo je do greške</h2>
          <p className="text-sm text-gray-500 max-w-md text-center font-mono bg-gray-100 p-3 rounded-lg">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Pokušaj ponovo
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
