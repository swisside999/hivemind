import { useCallback } from "react";
import { useAppStore } from "../stores/appStore.js";

export function useProject() {
  const projects = useAppStore((s) => s.projects);
  const activeProject = useAppStore((s) => s.activeProject);
  const setProjects = useAppStore((s) => s.setProjects);
  const setActiveProject = useAppStore((s) => s.setActiveProject);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects);
    } catch {
      // server may not be running yet
    }
  }, [setProjects]);

  const createProject = useCallback(async (name: string, displayName?: string) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, displayName }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    await fetchProjects();
    setActiveProject(name);
  }, [fetchProjects, setActiveProject]);

  const deleteProject = useCallback(async (name: string) => {
    await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
    await fetchProjects();
    if (activeProject === name) {
      setActiveProject(null);
    }
  }, [fetchProjects, activeProject, setActiveProject]);

  const selectProject = useCallback(async (name: string) => {
    await fetch(`/api/projects/${encodeURIComponent(name)}`);
    setActiveProject(name);
  }, [setActiveProject]);

  return { projects, activeProject, fetchProjects, createProject, deleteProject, selectProject };
}
