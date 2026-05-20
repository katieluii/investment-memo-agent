"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Memo, generateMemo, getMemo, getMemoExportUrl } from "../../../../lib/api";

export default function MemoPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);

  const [memo, setMemo] = useState<Memo | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMemo(id)
      .then(setMemo)
      .catch(() => {});
  }, [id]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const m = await generateMemo(id);
      setMemo(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate memo");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <p>
        <Link href={`/deals/${id}`}>← Back to deal</Link>
      </p>
      <h1>Investment Memo</h1>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating..." : "Generate Memo"}
        </button>
        <button
          onClick={() => getMemo(id).then(setMemo).catch((e) => setError(e.message))}
          disabled={generating}
        >
          Fetch Existing
        </button>
        {memo && (
          <button onClick={async () => {
            try {
              const res = await fetch(getMemoExportUrl(id));
              if (!res.ok) {
                const msg = await res.text().catch(() => res.statusText);
                setError(`Export failed: ${msg}`);
                return;
              }
              const blob = await res.blob();
              const disposition = res.headers.get("Content-Disposition") ?? "";
              const match = disposition.match(/filename="([^"]+)"/);
              const filename = match?.[1] ?? "Investment_Memo.docx";
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = filename;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : "Export failed");
            }
          }}>
            Export to Word ↓
          </button>
        )}
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {memo ? (
        <div>
          <small style={{ color: "#888" }}>
            Generated: {new Date(memo.created_at).toLocaleString()}
          </small>
          <pre
            style={{
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 4,
              padding: "1.5rem",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
              marginTop: "0.5rem",
              fontSize: "0.9rem",
            }}
          >
            {memo.markdown}
          </pre>
        </div>
      ) : (
        <p>No memo yet. Run agents first, then click "Generate Memo".</p>
      )}
    </div>
  );
}
