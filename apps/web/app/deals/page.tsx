"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Deal, getDeals } from "../../lib/api";

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getDeals()
      .then(setDeals)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Deals</h1>
        <Link href="/deals/new">
          <button>+ New Deal</button>
        </Link>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {!loading && !error && deals.length === 0 && <p>No deals yet. Create one to get started.</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
        {deals.length > 0 && (
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Company</th>
              <th style={{ padding: "0.5rem" }}>Asset</th>
              <th style={{ padding: "0.5rem" }}>Indication</th>
              <th style={{ padding: "0.5rem" }}>Stage</th>
              <th style={{ padding: "0.5rem" }}>Round</th>
            </tr>
          </thead>
        )}
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "0.5rem" }}>
                <Link href={`/deals/${d.id}`}>{d.company_name}</Link>
              </td>
              <td style={{ padding: "0.5rem" }}>{d.asset_name || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{d.indication || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{d.stage || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{d.round_type || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
