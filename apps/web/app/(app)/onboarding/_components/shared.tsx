"use client";

import { useCallback, useState } from "react";
import styles from "../onboarding.module.css";

export type StepNumber = 1 | 2 | 3;

/** Swatches offered for the pay page accent. */
export const BRAND_COLOURS: { hex: string; name: string }[] = [
  { hex: "#1E4FD6", name: "Bridge blue" },
  { hex: "#0F766E", name: "Teal" },
  { hex: "#0F172A", name: "Ink" },
  { hex: "#B45309", name: "Amber" },
  { hex: "#7C3AED", name: "Violet" },
];

/** Shakes a failed control once per attempt; the class alternates so the animation can replay. */
export function useShake() {
  const [run, setRun] = useState(0);
  const shake = useCallback(() => setRun((n) => n + 1), []);
  const shakeClass = (bad: boolean): string | undefined => (bad && run > 0 ? (run % 2 === 1 ? styles.shakeA : styles.shakeB) : undefined);
  return { shake, shakeClass };
}

const STEP1_KEY = "paybridge.onboarding.business:";

/** Remembers, for this browser tab only, that the business step was confirmed, so a refresh returns to the wallet step. */
export function businessStepSeen(merchantId: string): boolean {
  try {
    return window.sessionStorage.getItem(STEP1_KEY + merchantId) === "1";
  } catch {
    return false;
  }
}

export function markBusinessStepSeen(merchantId: string): void {
  try {
    window.sessionStorage.setItem(STEP1_KEY + merchantId, "1");
  } catch {
    // Storage can be blocked; the flow then simply starts at step 1 after a refresh.
  }
}

export function CheckIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className={className} d="M5 12l5 5L20 7" />
    </svg>
  );
}
