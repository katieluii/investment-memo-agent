"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AgentOutput, getAgentOutputs, runAgents } from "../../../../lib/api";

export default function ReviewPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);

  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = () =>
    getAgentOutputs(id)
      .then(setOutputs)
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, [id]);

  const handleRun = async () => {
    setRunning(true);
    setMessage("");
    setError("");
    try {
      const res = await runAgents(id);
      setMessage(res.message);
      refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to run agents");
    } finally {
      setRunning(false);
    }
  };

  // Show only the latest run per agent
  const latestByAgent = outputs.reduce<Record<string, AgentOutput>>((acc, o) => {
    if (!acc[o.agent_name]) acc[o.agent_name] = o;
    return acc;
  }, {});

  return (
    <div>
      <p>
        <Link href={`/deals/${id}`}>← Back to deal</Link>
      </p>
      <h1>Agent Review</h1>

      <button onClick={handleRun} disabled={running} style={{ marginBottom: "1rem" }}>
        {running ? "Running agents..." : "Run Agents"}
      </button>

      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {Object.keys(latestByAgent).length === 0 && !running && (
        <p>No agent outputs yet. Click "Run Agents" to generate.</p>
      )}

      {Object.values(latestByAgent).map((output) => (
        <div
          key={output.agent_name}
          style={{ border: "1px solid #ddd", borderRadius: 4, padding: "1rem", marginBottom: "1rem" }}
        >
          <h3 style={{ margin: "0 0 0.5rem" }}>{output.agent_name}</h3>
          <small style={{ color: "#888" }}>{new Date(output.created_at).toLocaleString()}</small>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "1rem",
              overflow: "auto",
              fontSize: "0.8rem",
              marginTop: "0.5rem",
            }}
          >
            {JSON.stringify(JSON.parse(output.output_json), null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
