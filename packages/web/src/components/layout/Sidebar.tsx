import { useAppStore } from "../../stores/appStore.js";
import { useProject } from "../../hooks/useProject.js";

export function Sidebar() {
  const { projects, activeProject, selectProject, deleteProject } = useProject();
  const setShowNewProject = useAppStore((s) => s.setShowNewProject);
  const agentConfigs = useAppStore((s) => s.agentConfigs);
  const agentStates = useAppStore((s) => s.agentStates);
  const escalations = useAppStore((s) => s.escalations);
  const usageStats = useAppStore((s) => s.usageStats);

  const activeCount = Array.from(agentStates.values()).filter((s) => s.status === "working").length;

  return (
    <aside className="flex w-56 flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo area */}
      <div className="border-b border-gray-800 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Projects
        </h2>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-2">
        {projects.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-gray-600">
            No projects yet
          </p>
        )}

        {projects.map((project) => (
          <button
            key={project.name}
            onClick={() => selectProject(project.name)}
            className={`mb-1 flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
              activeProject === project.name
                ? "bg-indigo-600/20 text-indigo-300"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
          >
            <span className="flex-1 truncate">{project.displayName}</span>
            <span className="text-xs text-gray-600">{project.agentCount}</span>
          </button>
        ))}
      </div>

      {/* New project button */}
      <div className="border-t border-gray-800 p-2">
        <button
          onClick={() => setShowNewProject(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-700"
        >
          <span className="text-lg leading-none">+</span>
          New Project
        </button>
      </div>

      {/* Company overview */}
      <div className="border-t border-gray-800 px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Overview
        </h3>
        <div className="space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Agents</span>
            <span className="text-gray-300">{agentConfigs.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Active</span>
            <span className="text-blue-400">{activeCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Escalations</span>
            <span className={escalations.length > 0 ? "text-amber-400" : "text-gray-300"}>
              {escalations.length}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Invocations</span>
            <span className="text-gray-300">
              {Object.values(usageStats).reduce((sum, s) => sum + s.invocations, 0)}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
