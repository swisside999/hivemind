import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../stores/appStore.js";
import { ChatMessage } from "./ChatMessage.js";
import { EscalationBanner } from "./EscalationBanner.js";
import { StreamingMessage } from "./StreamingMessage.js";
import { CompanyFeed } from "./CompanyFeed.js";

interface Props {
  sendMessage: (agent: string, message: string) => void;
  resolveEscalation: (id: string, resolution: string) => void;
}

export function ChatPanel({ sendMessage, resolveEscalation }: Props) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatTarget = useAppStore((s) => s.chatTarget);
  const chatHistories = useAppStore((s) => s.chatHistories);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const agentConfigs = useAppStore((s) => s.agentConfigs);
  const isThinking = useAppStore((s) => s.isThinking);
  const setIsThinking = useAppStore((s) => s.setIsThinking);
  const streamingText = useAppStore((s) => s.streamingText);
  const chatMode = useAppStore((s) => s.chatMode);
  const setChatMode = useAppStore((s) => s.setChatMode);

  const chatMessages = chatHistories.get(chatTarget) ?? [];
  const targetConfig = agentConfigs.find((c) => c.name === chatTarget);
  const currentStream = streamingText.get(chatTarget) ?? "";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isThinking, currentStream]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    addChatMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    });

    setIsThinking(true);
    sendMessage(chatTarget, trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <aside className="flex w-96 flex-col border-l border-gray-800 bg-gray-900">
      {/* Mode toggle header */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setChatMode("direct")}
          className={`flex-1 py-2 text-xs font-bold tracking-widest transition ${
            chatMode === "direct"
              ? "border-b-2 border-indigo-500 bg-gray-800 text-indigo-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
          style={{ fontFamily: "ui-monospace, monospace" }}
        >
          DIRECT
        </button>
        <button
          onClick={() => setChatMode("feed")}
          className={`flex-1 py-2 text-xs font-bold tracking-widest transition ${
            chatMode === "feed"
              ? "border-b-2 border-indigo-500 bg-gray-800 text-indigo-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
          style={{ fontFamily: "ui-monospace, monospace" }}
        >
          FEED
        </button>
      </div>

      {chatMode === "direct" ? (
        <>
          {/* Agent info header */}
          <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
            {targetConfig && (
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: targetConfig.color }}
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-gray-100">
                {targetConfig?.displayName ?? chatTarget}
              </h2>
              <p className="text-xs text-gray-500 truncate">
                {isThinking ? "Thinking..." : (targetConfig?.description?.slice(0, 60) ?? "Agent")}
              </p>
            </div>
            {isThinking && !currentStream && (
              <div className="flex items-center gap-0.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            )}
          </div>

          {/* Escalation banners */}
          <EscalationBanner resolveEscalation={resolveEscalation} />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-3">
            {chatMessages.length === 0 && !isThinking && (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-600">
                Send a message to {targetConfig?.displayName ?? "the agent"} to get started.
                <br />
                Click any agent on The Floor to switch who you&apos;re talking to.
              </div>
            )}
            {chatMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {/* Streaming / thinking indicator */}
            {isThinking && (
              <StreamingMessage
                agentName={targetConfig?.displayName ?? chatTarget}
                text={currentStream}
              />
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 p-3">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${targetConfig?.displayName ?? chatTarget}...`}
                className="flex-1 resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:ring-1 focus:ring-indigo-500"
                rows={2}
                disabled={isThinking}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isThinking}
                className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isThinking ? "..." : "Send"}
              </button>
            </div>
          </div>
        </>
      ) : (
        /* FEED mode */
        <CompanyFeed />
      )}
    </aside>
  );
}
