"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Document, getDocuments, indexDocuments, uploadDocument } from "../../../../lib/api";

export default function DocumentsPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = () =>
    getDocuments(id)
      .then(setDocs)
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, [id]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage("");
    setError("");
    try {
      await uploadDocument(id, file);
      if (fileRef.current) fileRef.current.value = "";
      setMessage("File uploaded.");
      refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleIndex = async () => {
    setIndexing(true);
    setMessage("");
    setError("");
    try {
      const res = await indexDocuments(id);
      setMessage(res.message);
      refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Indexing failed");
    } finally {
      setIndexing(false);
    }
  };

  return (
    <div>
      <p>
        <Link href={`/deals/${id}`}>← Back to deal</Link>
      </p>
      <h1>Documents</h1>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <input ref={fileRef} type="file" accept=".txt,.md" />
        <button onClick={handleUpload} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {docs.length === 0 ? (
        <p>No documents uploaded yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: "0.4rem" }}>Filename</th>
              <th style={{ padding: "0.4rem" }}>Status</th>
              <th style={{ padding: "0.4rem" }}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.4rem" }}>{doc.filename}</td>
                <td style={{ padding: "0.4rem" }}>{doc.status}</td>
                <td style={{ padding: "0.4rem" }}>{new Date(doc.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button onClick={handleIndex} disabled={indexing || docs.length === 0}>
        {indexing ? "Indexing..." : "Index Documents"}
      </button>
    </div>
  );
}
