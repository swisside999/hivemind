import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { ChatMessage as ChatMessageType } from "../../types/index.js";

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const html = useMemo(() => {
    if (message.role === "user") return "";
    return DOMPurify.sanitize(marked.parse(message.content, { async: false, breaks: true, gfm: true }) as string);
  }, [message.content, message.role]);

  if (message.role === "system") {
    return (
      <div className="mx-4 my-2 rounded-lg bg-gray-800/50 px-3 py-2 text-center text-xs text-gray-400 italic">
        {message.content}
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} px-4 py-1.5`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-indigo-600 text-white"
            : "bg-gray-800 text-gray-200"
        }`}
      >
        {!isUser && message.agent && (
          <div className="mb-1 text-xs font-medium text-gray-400">
            {message.agent}
          </div>
        )}
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div
            className="chat-markdown"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        <div className={`mt-1 text-xs ${isUser ? "text-indigo-300" : "text-gray-500"}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
