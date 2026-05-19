"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Deal, getDeal } from "../../../lib/api";

export default function DealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getDeal(id)
      .then(setDeal)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!deal) return null;

  const rows: [string, string][] = [
    ["Company", deal.company_name],
    ["Asset", deal.asset_name || "—"],
    ["Indication", deal.indication || "—"],
    ["Stage", deal.stage || "—"],
    ["Round", deal.round_type || "—"],
    ["Geography", deal.geography || "—"],
    ["Status", deal.status],
    ["Created", new Date(deal.created_at).toLocaleDateString()],
  ];

  return (
    <div>
      <p><Link href="/deals">← All deals</Link></p>
      <h1>{deal.company_name}</h1>

      <table style={{ borderCollapse: "collapse", marginBottom: "1.5rem" }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "0.3rem 1rem 0.3rem 0", fontWeight: "bold", whiteSpace: "nowrap" }}>
                {label}
              </td>
              <td style={{ padding: "0.3rem 0" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {deal.fund_thesis && (
        <div style={{ marginBottom: "1.5rem" }}>
          <strong>Fund Thesis</strong>
          <p style={{ marginTop: "0.25rem" }}>{deal.fund_thesis}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
        <Link href={`/deals/${id}/documents`}>
          <button>Documents →</button>
        </Link>
        <Link href={`/deals/${id}/review`}>
          <button>Review →</button>
        </Link>
        <Link href={`/deals/${id}/memo`}>
          <button>Memo →</button>
        </Link>
      </div>
    </div>
  );
}
