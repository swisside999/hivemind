import { useAppStore } from "../../stores/appStore.js";

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  working: "Working",
  waiting: "Waiting",
  error: "Error",
};

export function AgentDetailModal() {
  const selectedAgent = useAppStore((s) => s.selectedAgent);
  const agentConfigs = useAppStore((s) => s.agentConfigs);
  const agentStates = useAppStore((s) => s.agentStates);
  const setShowAgentDetail = useAppStore((s) => s.setShowAgentDetail);

  if (!selectedAgent) return null;

  const config = agentConfigs.find((c) => c.name === selectedAgent);
  const state = agentStates.get(selectedAgent);

  if (!config) return null;

  const close = () => setShowAgentDetail(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={close}>
      <div
        className="w-full max-w-lg rounded-xl bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-800 px-6 py-4">
          <div
            className="h-8 w-8 rounded-full"
            style={{ backgroundColor: config.color }}
          />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-100">{config.displayName}</h2>
            <p className="text-xs text-gray-400">{config.role} &middot; Authority {config.authorityLevel}/5</p>
          </div>
          <button onClick={close} className="text-gray-500 hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-96 overflow-y-auto px-6 py-4 space-y-4">
          {/* Status */}
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-gray-500">Status</h3>
            <p className="text-sm text-gray-300">
              {STATUS_LABELS[state?.status ?? "idle"]}
              {state?.currentThought && (
                <span className="ml-2 text-gray-500">— {state.currentThought.slice(0, 100)}</span>
              )}
            </p>
          </div>

          {/* Description */}
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-gray-500">Description</h3>
            <p className="text-sm text-gray-300">{config.description}</p>
          </div>

          {/* Hierarchy */}
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-gray-500">Hierarchy</h3>
            <p className="text-sm text-gray-400">
              Reports to: <span className="text-gray-300">{config.reportsTo ?? "Board (User)"}</span>
            </p>
            {config.directReports.length > 0 && (
              <p className="text-sm text-gray-400">
                Direct reports: <span className="text-gray-300">{config.directReports.join(", ")}</span>
              </p>
            )}
          </div>

          {/* Model */}
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-gray-500">Model</h3>
            <span className="inline-block rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
              {config.model}
            </span>
            {config.canEscalateToUser && (
              <span className="ml-2 inline-block rounded bg-amber-800/50 px-2 py-0.5 text-xs text-amber-300">
                Can escalate to user
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-6 py-3">
          <button
            onClick={close}
            className="rounded-md bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
