import React from "react";

interface TokenBarProps {
  value: number;
  max: number;
  tone?: "blue" | "purple" | "cyan" | "green";
}

export default function TokenBar({ value, max, tone = "blue" }: TokenBarProps) {
  const height = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;

  return (
    <span className={`vertical-token-bar tone-${tone}`} aria-hidden="true">
      <i style={{ height: `${height}%` }} />
    </span>
  );
}
