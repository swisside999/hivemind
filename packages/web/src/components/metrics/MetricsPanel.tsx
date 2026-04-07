import { useAppStore } from "../../stores/appStore.js";

function formatResponseTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatLastInvoked(iso: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function successRateColor(rate: number): string {
  if (rate >= 90) return "#10B981";
  if (rate >= 70) return "#F59E0B";
  return "#EF4444";
}

export function MetricsPanel() {
  const agentMetrics = useAppStore((s) => s.agentMetrics);
  const agentConfigs = useAppStore((s) => s.agentConfigs);

  const cards = agentConfigs.map((config) => {
    const m = agentMetrics[config.name];
    return { config, metrics: m };
  });

  const totalInvocations = Object.values(agentMetrics).reduce((sum, m) => sum + m.invocations, 0);
  const totalSuccess = Object.values(agentMetrics).reduce((sum, m) => sum + m.successCount, 0);
  const totalErrors = Object.values(agentMetrics).reduce((sum, m) => sum + m.errorCount, 0);
  const totalCalls = totalSuccess + totalErrors;
  const overallRate = totalCalls > 0 ? Math.round((totalSuccess / totalCalls) * 100) : 0;

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: 24,
        background: "#0a0a1a",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        color: "#d1d5db",
      }}
    >
      <div
        style={{
          marginBottom: 24,
          padding: 16,
          background: "#0f0f23",
          border: "1px solid #2a2a4e",
          borderTop: "1px solid #3a3a5e",
          borderLeft: "1px solid #3a3a5e",
          borderBottom: "1px solid #12122a",
          borderRight: "1px solid #12122a",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "#6b7280", marginBottom: 8 }}>
          AGENT PERFORMANCE
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 13 }}>
          <div>
            <div style={{ color: "#6b7280", fontSize: 10 }}>TOTAL INVOCATIONS</div>
            <div style={{ color: "#d1d5db", fontSize: 20, marginTop: 4 }}>{totalInvocations}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280", fontSize: 10 }}>SUCCESS RATE</div>
            <div style={{ color: successRateColor(overallRate), fontSize: 20, marginTop: 4 }}>
              {overallRate}%
            </div>
          </div>
          <div>
            <div style={{ color: "#6b7280", fontSize: 10 }}>SUCCESS / ERRORS</div>
            <div style={{ color: "#d1d5db", fontSize: 20, marginTop: 4 }}>
              {totalSuccess} / {totalErrors}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {cards.map(({ config, metrics }) => {
          const hasData = metrics && metrics.invocations > 0;
          const calls = metrics ? metrics.successCount + metrics.errorCount : 0;
          const rate = calls > 0 && metrics ? Math.round((metrics.successCount / calls) * 100) : 0;
          const successRatio = calls > 0 && metrics ? metrics.successCount / calls : 0;

          return (
            <div
              key={config.name}
              style={{
                padding: 14,
                background: "#0f0f23",
                border: "1px solid #2a2a4e",
                borderTop: "1px solid #3a3a5e",
                borderLeft: "1px solid #3a3a5e",
                borderBottom: "1px solid #12122a",
                borderRight: "1px solid #12122a",
                opacity: hasData ? 1 : 0.55,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: config.color,
                    display: "inline-block",
                  }}
                />
                <span style={{ fontSize: 13, color: "#e5e7eb", fontWeight: 600 }}>
                  {config.displayName}
                </span>
                <span style={{ fontSize: 10, color: "#6b7280", marginLeft: "auto" }}>
                  {config.role}
                </span>
              </div>

              {hasData && metrics ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 9 }}>INVOCATIONS</div>
                      <div style={{ color: "#d1d5db", marginTop: 2 }}>{metrics.invocations}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 9 }}>AVG RESPONSE</div>
                      <div style={{ color: "#d1d5db", marginTop: 2 }}>
                        {formatResponseTime(metrics.avgResponseTimeMs)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 9 }}>SUCCESS RATE</div>
                      <div style={{ color: successRateColor(rate), marginTop: 2 }}>{rate}%</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 9 }}>MESSAGES ROUTED</div>
                      <div style={{ color: "#d1d5db", marginTop: 2 }}>{metrics.messagesRouted}</div>
                    </div>
                  </div>

                  {/* Pixel-art success bar */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ color: "#6b7280", fontSize: 9, marginBottom: 4 }}>
                      {metrics.successCount} / {calls}
                    </div>
                    <div
                      style={{
                        height: 8,
                        background: "#1a1a2e",
                        border: "1px solid #2a2a4e",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          width: `${successRatio * 100}%`,
                          height: "100%",
                          background: successRateColor(rate),
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 9, color: "#6b7280" }}>
                    Last invoked: {formatLastInvoked(metrics.lastInvoked)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", padding: "12px 0" }}>
                  No data yet
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
