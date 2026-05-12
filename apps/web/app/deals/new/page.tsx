"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DealCreate, createDeal } from "../../../lib/api";

const FIELDS: Array<{ key: keyof DealCreate; label: string; multiline?: boolean }> = [
  { key: "company_name", label: "Company Name *" },
  { key: "asset_name", label: "Asset Name" },
  { key: "indication", label: "Indication" },
  { key: "stage", label: "Stage (e.g. Phase 2, Pre-clinical)" },
  { key: "round_type", label: "Round Type (e.g. Series B)" },
  { key: "geography", label: "Geography" },
  { key: "memo_format", label: "Memo Format" },
  { key: "fund_thesis", label: "Fund Thesis / Investment Rationale", multiline: true },
];

export default function NewDealPage() {
  const router = useRouter();
  const [form, setForm] = useState<DealCreate>({ company_name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof DealCreate, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim()) {
      setError("Company name is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const deal = await createDeal(form);
      router.push(`/deals/${deal.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create deal");
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>New Deal</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
        {FIELDS.map(({ key, label, multiline }) => (
          <div key={key} style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>{label}</label>
            {multiline ? (
              <textarea
                rows={4}
                style={{ width: "100%", fontFamily: "monospace" }}
                value={(form[key] as string) || ""}
                onChange={(e) => set(key, e.target.value)}
              />
            ) : (
              <input
                type="text"
                style={{ width: "100%", fontFamily: "monospace" }}
                value={(form[key] as string) || ""}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
          </div>
        ))}
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Deal"}
        </button>
      </form>
    </div>
  );
}
