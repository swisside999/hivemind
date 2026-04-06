import { useAppStore } from "../../stores/appStore.js";

export function Header() {
  const connected = useAppStore((s) => s.connected);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const activeProject = useAppStore((s) => s.activeProject);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);

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

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {(["floor", "tickets", "wiki"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                letterSpacing: "0.07em",
                padding: "3px 10px",
                cursor: "pointer",
                border: activeView === view ? "1px solid #3a3a5e" : "1px solid transparent",
                background: activeView === view ? "#1a1a2e" : "transparent",
                color: activeView === view ? "#d1d5db" : "#6b7280",
                textTransform: "uppercase",
              }}
            >
              {view === "floor" ? "THE FLOOR" : view === "tickets" ? "TICKETS" : "WIKI"}
            </button>
          ))}
        </div>
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
