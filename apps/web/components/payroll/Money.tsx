import { formatAmount } from "@/lib/format";

/** A headline amount: serif figures, the asset code small in mono. Decimal strings only. */
export function Money({ amount, unit = "USDC", size = 40, minDecimals = 2, style }: { amount: string; unit?: string; size?: number; minDecimals?: number; style?: React.CSSProperties }) {
  return (
    <span className="money" style={{ fontSize: size, lineHeight: 1, ...style }}>
      {formatAmount(amount, minDecimals)}
      <span className="unit">{unit}</span>
    </span>
  );
}
