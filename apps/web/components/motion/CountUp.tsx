"use client";

import { useEffect, useRef, useState } from "react";
import { parseAmount } from "@paybridge/shared";
import { formatAmount } from "@/lib/format";

const DURATION = 900;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function stroopsToDecimal(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const frac = (stroops % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}

function useProgress(key: string): number {
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      setProgress(easeOut(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [key]);
  return progress;
}

/**
 * An amount that counts up to its value when it appears or changes. The value stays a decimal
 * string end to end: the animation interpolates whole stroops with bigint, never a float amount.
 */
export function CountUpAmount({ value, minDecimals = 2 }: { value: string; minDecimals?: number }) {
  const progress = useProgress(value);
  const target = parseAmount(value) ?? 0n;
  const shown = progress >= 1 ? target : (target * BigInt(Math.round(progress * 1000))) / 1000n;
  // While counting, hide stroop-level noise; the final frame shows the exact value.
  const text = progress >= 1 ? formatAmount(value, minDecimals) : formatAmount(stroopsToDecimal(shown - (shown % 100_000n)), minDecimals);
  return <span className="tnum" aria-label={formatAmount(value, minDecimals)}>{text}</span>;
}

/** A whole number (a count, a percentage) that counts up. */
export function CountUpInt({ value, suffix = "" }: { value: number; suffix?: string }) {
  const progress = useProgress(String(value));
  return (
    <span className="tnum" aria-label={`${value}${suffix}`}>
      {Math.round(value * progress)}
      {suffix}
    </span>
  );
}
