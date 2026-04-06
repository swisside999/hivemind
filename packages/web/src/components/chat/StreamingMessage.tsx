import { useMemo } from "react";
import { marked } from "marked";

interface Props {
  agentName: string;
  text: string;
}

export function StreamingMessage({ agentName, text }: Props) {
  const html = useMemo(() => {
    if (!text) return "";
    return marked.parse(text, { async: false }) as string;
  }, [text]);

  return (
    <div className="flex justify-start px-4 py-1.5">
      <div className="max-w-[85%] rounded-2xl bg-gray-800 px-4 py-2.5 text-sm leading-relaxed text-gray-200">
        <div className="mb-1 text-xs font-medium text-gray-400">{agentName}</div>
        {text ? (
          <div className="chat-markdown" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="flex items-center gap-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <span
          className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 align-text-bottom"
          style={{ animation: "pulse-slow 1s ease-in-out infinite" }}
        />
      </div>
    </div>
  );
}
