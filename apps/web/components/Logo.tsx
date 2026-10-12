import Link from "next/link";

interface MarkProps {
  size?: number;
  /** Background of the rounded tile. */
  fill?: string;
  /** Draws the span in when it mounts: the arch crosses, the deck lands, the cables drop. */
  animated?: boolean;
  /** Keeps a small light travelling across the arch (use for "working" states). */
  travelling?: boolean;
}

/** The PayBridge mark: a bridge span on a rounded tile. The arch is the payment crossing, the deck is the ledger. */
export function LogoMark({ size = 32, fill = "#1E4FD6", animated = false, travelling = false }: MarkProps) {
  const draw = (length: number, delay: number): React.CSSProperties | undefined =>
    animated
      ? ({ "--len": length, strokeDasharray: length, animation: `logo-draw 0.7s cubic-bezier(0.2,0.8,0.2,1) ${delay}s both` } as React.CSSProperties)
      : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="64" height="64" rx="16" fill={fill} />
      <path d="M10 42V32C18 18 46 18 54 32V42" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" style={draw(90, 0.1)} />
      <path d="M8 42H56" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" style={draw(50, 0.45)} />
      <path d="M22 42V34M32 42V28M42 42V34" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.85" style={draw(32, 0.75)} />
      {travelling ? (
        <circle r="3.2" fill="#93C5FD" style={{ offsetPath: "path('M10 32C18 18 46 18 54 32')", animation: "travel 1.6s ease-in-out infinite alternate" }} />
      ) : null}
    </svg>
  );
}

interface LogoProps {
  href?: string;
  size?: number;
  fontSize?: number;
  /** "light" = on a light surface; "dark" = on the ink panel. */
  on?: "light" | "dark";
  animated?: boolean;
  style?: React.CSSProperties;
}

export function Logo({ href = "/", size = 32, fontSize = 19, on = "light", animated = false, style }: LogoProps) {
  const dark = on === "dark";
  return (
    <Link href={href} aria-label="PayBridge home" style={{ display: "flex", alignItems: "center", gap: 10, color: dark ? "#FFFFFF" : "var(--ink)", textDecoration: "none", ...style }}>
      <LogoMark size={size} animated={animated} />
      <span style={{ fontSize, fontWeight: 800, letterSpacing: "-0.02em" }}>
        Pay<span style={{ color: dark ? "var(--brand-on-dark)" : "var(--brand)" }}>Bridge</span>
      </span>
    </Link>
  );
}
