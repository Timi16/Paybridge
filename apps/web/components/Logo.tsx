import Link from "next/link";

interface MarkProps {
  size?: number;
  /** Draws the two rules in when it mounts. */
  animated?: boolean;
  /** "light" = on paper; "dark" = on the night panel. */
  on?: "light" | "dark";
}

/** The PayBridge mark: a coin with a double rule, the line under a total that is final. */
export function LogoMark({ size = 30, animated = false, on = "light" }: MarkProps) {
  const draw = (delay: number): React.CSSProperties | undefined =>
    animated ? ({ "--len": 30, strokeDasharray: 30, animation: `logo-draw 0.6s cubic-bezier(0.2,0.8,0.2,1) ${delay}s both` } as React.CSSProperties) : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="32" cy="32" r="30" fill={on === "dark" ? "#8FD3B4" : "#0F6B4B"} />
      <path d="M17 26H47" stroke={on === "dark" ? "#14201A" : "#FFFDF8"} strokeWidth="5" strokeLinecap="round" style={draw(0.1)} />
      <path d="M17 38H47" stroke={on === "dark" ? "#14201A" : "#FFFDF8"} strokeWidth="5" strokeLinecap="round" style={draw(0.3)} />
    </svg>
  );
}

interface LogoProps {
  href?: string;
  size?: number;
  fontSize?: number;
  on?: "light" | "dark";
  animated?: boolean;
  style?: React.CSSProperties;
}

export function Logo({ href = "/", size = 28, fontSize = 26, on = "light", animated = false, style }: LogoProps) {
  return (
    <Link
      href={href}
      aria-label="PayBridge home"
      style={{ display: "inline-flex", alignItems: "center", gap: 10, color: on === "dark" ? "var(--on-night)" : "var(--ink)", textDecoration: "none", ...style }}
    >
      <LogoMark size={size} animated={animated} on={on} />
      <span style={{ fontFamily: "var(--font-serif)", fontSize, lineHeight: 1, letterSpacing: "-0.01em" }}>PayBridge</span>
    </Link>
  );
}
