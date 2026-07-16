import React from "react";

interface TokenBarProps {
  value: number;
  max: number;
  tone?: "blue" | "purple" | "cyan" | "green";
}

const MINIMUM_VISIBLE_HEIGHT_PERCENT = 3;
const PERCENT_SCALE = 100;

const TokenBar: React.FC<TokenBarProps> = ({ value, max, tone = "blue" }) => {
  const height =
    max > 0
      ? Math.max(MINIMUM_VISIBLE_HEIGHT_PERCENT, Math.round((value / max) * PERCENT_SCALE))
      : 0;

  return (
    <span className={`vertical-token-bar tone-${tone}`} aria-hidden="true">
      <i style={{ height: `${height}%` }} />
    </span>
  );
};

export default TokenBar;
