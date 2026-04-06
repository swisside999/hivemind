import { useAppStore } from "../../stores/appStore.js";

export function Header() {
  const connected = useAppStore((s) => s.connected);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const activeProject = useAppStore((s) => s.activeProject);

  return (
    <header className="flex h-12 items-center justify-between border-b border-gray-800 bg-gray-900 px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          title="Toggle sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <h1 className="text-sm font-bold tracking-wide text-gray-100">
          HIVEMIND
        </h1>

        {activeProject && (
          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {activeProject}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
        <span className="text-xs text-gray-500">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
    </header>
  );
}
