"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
}

/**
 * Marks its element with data-state so the CSS module can run a choreographed entrance:
 * "static" (server render, reduced motion, or already on screen: everything simply visible),
 * "armed" (below the fold, waiting) and "in" (scrolled into view: play once).
 */
export function InView({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "armed" | "in">("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) {
      setState("in"); // on screen at load: play straight away
      return;
    }
    setState("armed");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("in");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} data-state={state}>
      {children}
    </div>
  );
}
