import { useAgentNodes } from "../../hooks/useAgents.js";
import { useAppStore } from "../../stores/appStore.js";
import { AgentNode } from "./AgentNode.js";
import { ConnectionLine } from "./ConnectionLine.js";

export function FloorView() {
  const nodes = useAgentNodes();
  const connections = useAppStore((s) => s.connections);
  const connected = useAppStore((s) => s.connected);

  const nodeMap = new Map(nodes.map((n) => [n.config.name, n]));

  // Build hierarchy lines (permanent, subtle)
  const hierarchyLines: { from: typeof nodes[0]; to: typeof nodes[0] }[] = [];
  for (const node of nodes) {
    if (node.config.reportsTo) {
      const parent = nodeMap.get(node.config.reportsTo);
      if (parent) {
        hierarchyLines.push({ from: parent, to: node });
      }
    }
  }

  return (
    <div className="relative h-full w-full bg-gray-950">
      {/* Connection status */}
      {!connected && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-lg bg-red-900/80 px-4 py-2 text-sm text-red-200">
          Disconnected — reconnecting...
        </div>
      )}

      {nodes.length === 0 && (
        <div className="flex h-full items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="text-lg font-medium">No project loaded</p>
            <p className="mt-1 text-sm">Create a project to get started</p>
          </div>
        </div>
      )}

      <svg
        viewBox="0 0 1000 550"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Hierarchy lines (subtle) */}
        {hierarchyLines.map(({ from, to }) => (
          <line
            key={`h-${from.config.name}-${to.config.name}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="#374151"
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.4}
          />
        ))}

        {/* Active communication lines */}
        {connections.map((conn) => {
          const fromNode = nodeMap.get(conn.from);
          const toNode = nodeMap.get(conn.to);
          if (!fromNode || !toNode) return null;
          return (
            <ConnectionLine
              key={`c-${conn.from}-${conn.to}`}
              from={fromNode}
              to={toNode}
              label={conn.type.replace("_", " ")}
            />
          );
        })}

        {/* Agent nodes */}
        {nodes.map((node) => (
          <AgentNode key={node.config.name} node={node} />
        ))}
      </svg>
    </div>
  );
}
