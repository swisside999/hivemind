import { useState } from "react";
import { useAppStore } from "../../stores/appStore.js";
import { useProject } from "../../hooks/useProject.js";

export function NewProjectModal() {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const setShowNewProject = useAppStore((s) => s.setShowNewProject);
  const { createProject } = useProject();

  const close = () => setShowNewProject(false);

  const handleCreate = async () => {
    setError("");
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug) {
      setError("Name is required");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError("Name must be lowercase letters, numbers, and hyphens");
      return;
    }

    setCreating(true);
    try {
      await createProject(slug, displayName.trim() || undefined);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={close}>
      <div
        className="w-full max-w-md rounded-xl bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-100">New Project</h2>
          <p className="text-xs text-gray-500">Each project is a new company with fresh agents.</p>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Project slug
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="my-project"
              className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Display name (optional)
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="My Project"
              className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-800 px-6 py-3">
          <button
            onClick={close}
            className="rounded-md bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
