import { useAppStore } from "../../stores/appStore.js";
import type { EscalationRequest } from "../../types/index.js";

interface Props {
  resolveEscalation: (id: string, resolution: string) => void;
}

export function EscalationBanner({ resolveEscalation }: Props) {
  const escalations = useAppStore((s) => s.escalations);

  if (escalations.length === 0) return null;

  return (
    <div className="space-y-2 border-b border-gray-700 bg-amber-900/20 p-3">
      {escalations.map((esc) => (
        <EscalationCard key={esc.id} escalation={esc} onResolve={resolveEscalation} />
      ))}
    </div>
  );
}

function EscalationCard({
  escalation,
  onResolve,
}: {
  escalation: EscalationRequest;
  onResolve: (id: string, resolution: string) => void;
}) {
  return (
    <div className="rounded-lg bg-gray-800 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-xs font-medium text-amber-300">
          {escalation.from} needs your input
        </span>
      </div>

      <p className="mb-1 text-sm font-medium text-gray-200">
        {escalation.message.subject}
      </p>
      <p className="mb-3 text-xs text-gray-400">
        {escalation.message.body.slice(0, 200)}
        {escalation.message.body.length > 200 ? "..." : ""}
      </p>

      <div className="flex gap-2">
        {escalation.options.map((option) => (
          <button
            key={option.value}
            onClick={() => onResolve(escalation.id, option.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              option.value === "approve"
                ? "bg-green-600 text-white hover:bg-green-500"
                : option.value === "reject"
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
