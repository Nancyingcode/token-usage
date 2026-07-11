interface TokenBarProps {
  value: number;
  max: number;
}

export default function TokenBar({ value, max }: TokenBarProps) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;

  return (
    <div className="token-bar" aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </div>
  );
}
