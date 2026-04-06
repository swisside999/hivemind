import { useEffect } from "react";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { useProject } from "./hooks/useProject.js";
import { useAppStore } from "./stores/appStore.js";
import { Header } from "./components/layout/Header.js";
import { Sidebar } from "./components/layout/Sidebar.js";
import { FloorView } from "./components/floor/FloorView.js";
import { ChatPanel } from "./components/chat/ChatPanel.js";
import { AgentDetailModal } from "./components/agents/AgentDetailModal.js";
import { NewProjectModal } from "./components/projects/NewProjectModal.js";
import { TicketBoard } from "./components/tickets/TicketBoard.js";
import { TicketDetail } from "./components/tickets/TicketDetail.js";
import { NewTicketModal } from "./components/tickets/NewTicketModal.js";

export function App() {
  const { sendMessage, resolveEscalation } = useWebSocket();
  const { fetchProjects } = useProject();
  const showAgentDetail = useAppStore((s) => s.showAgentDetail);
  const showNewProject = useAppStore((s) => s.showNewProject);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const activeView = useAppStore((s) => s.activeView);
  const showTicketDetail = useAppStore((s) => s.showTicketDetail);
  const showNewTicket = useAppStore((s) => s.showNewTicket);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && <Sidebar />}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-auto">
            {activeView === "floor" ? <FloorView /> : <TicketBoard />}
          </main>

          <ChatPanel sendMessage={sendMessage} />
        </div>
      </div>

      {showAgentDetail && <AgentDetailModal />}
      {showNewProject && <NewProjectModal />}
      {showTicketDetail && <TicketDetail />}
      {showNewTicket && <NewTicketModal />}
    </div>
  );
}
