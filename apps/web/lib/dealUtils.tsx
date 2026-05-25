import { Deal } from "./api";

export function dealDisplayId(deal: Deal): string {
  const firstName = deal.company_name.trim().split(/\s+/)[0];
  return `${deal.id}_${firstName}`;
}

export const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  live:           { label: "Live",          bg: "#dcfce7", color: "#166534" },
  "under-review": { label: "Under review",  bg: "#dbeafe", color: "#1d4ed8" },
  "to-follow-up": { label: "To follow-up",  bg: "#fef3c7", color: "#92400e" },
  dormant:        { label: "Dormant",       bg: "#f3f4f6", color: "#4b5563" },
  lost:           { label: "Lost",          bg: "#fee2e2", color: "#991b1b" },
  active:         { label: "Live",          bg: "#dcfce7", color: "#166534" }, // legacy
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{
      display: "inline-block",
      padding: "0.15rem 0.5rem",
      borderRadius: "9999px",
      fontSize: "0.75em",
      fontWeight: "bold",
      background: cfg.bg,
      color: cfg.color,
      whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}
