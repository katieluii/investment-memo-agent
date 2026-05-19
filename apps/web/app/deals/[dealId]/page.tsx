"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Deal, DealCreate, getDeal, updateDeal } from "../../../lib/api";

const FIELDS: Array<{ key: keyof DealCreate; label: string; multiline?: boolean }> = [
  { key: "company_name", label: "Company" },
  { key: "asset_name", label: "Asset" },
  { key: "indication", label: "Indication" },
  { key: "stage", label: "Stage" },
  { key: "round_type", label: "Round" },
  { key: "geography", label: "Geography" },
  { key: "fund_thesis", label: "Fund Thesis", multiline: true },
];

export default function DealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DealCreate>({ company_name: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    getDeal(id)
      .then((d) => { setDeal(d); setForm(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const updated = await updateDeal(id, form);
      setDeal(updated);
      setEditing(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(deal!);
    setEditing(false);
    setSaveError("");
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!deal) return null;

  return (
    <div>
      <p><Link href="/deals">← All deals</Link></p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1>{deal.company_name}</h1>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ marginTop: "0.5rem" }}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ maxWidth: 600 }}>
          {FIELDS.map(({ key, label, multiline }) => (
            <div key={key} style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "bold" }}>
                {label}
              </label>
              {multiline ? (
                <textarea
                  rows={4}
                  style={{ width: "100%", fontFamily: "monospace" }}
                  value={(form[key] as string) || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              ) : (
                <input
                  type="text"
                  style={{ width: "100%", fontFamily: "monospace" }}
                  value={(form[key] as string) || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {saveError && <p style={{ color: "red" }}>{saveError}</p>}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={handleCancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <table style={{ borderCollapse: "collapse", marginBottom: "1.5rem" }}>
            <tbody>
              {[
                ["Company", deal.company_name],
                ["Asset", deal.asset_name || "—"],
                ["Indication", deal.indication || "—"],
                ["Stage", deal.stage || "—"],
                ["Round", deal.round_type || "—"],
                ["Geography", deal.geography || "—"],
                ["Status", deal.status],
                ["Created", new Date(deal.created_at).toLocaleDateString()],
              ].map(([label, value]) => (
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
            <Link href={`/deals/${id}/documents`}><button>Documents →</button></Link>
            <Link href={`/deals/${id}/review`}><button>Review →</button></Link>
            <Link href={`/deals/${id}/memo`}><button>Memo →</button></Link>
          </div>
        </>
      )}
    </div>
  );
}
