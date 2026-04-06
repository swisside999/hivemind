import { useProject } from "../../hooks/useProject.js";

export function ProjectList() {
  const { projects, activeProject, selectProject, deleteProject } = useProject();

  if (projects.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No projects yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {projects.map((project) => (
        <div
          key={project.name}
          className={`group flex items-center rounded-md px-3 py-2 ${
            activeProject === project.name
              ? "bg-indigo-600/20 text-indigo-300"
              : "text-gray-400 hover:bg-gray-800"
          }`}
        >
          <button
            onClick={() => selectProject(project.name)}
            className="flex-1 text-left text-sm"
          >
            <span className="font-medium">{project.displayName}</span>
            <span className="ml-2 text-xs text-gray-600">
              {project.agentCount} agents
            </span>
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
                deleteProject(project.name);
              }
            }}
            className="hidden text-xs text-red-400 hover:text-red-300 group-hover:block"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
