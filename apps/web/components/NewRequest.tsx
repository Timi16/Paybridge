"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { NewRequestDialog } from "./NewRequestDialog";

export interface NewRequestPrefill {
  amount?: string;
  asset?: "USDC" | "XLM";
  description?: string;
  customerEmail?: string;
}

const NewRequestContext = createContext<(prefill?: NewRequestPrefill) => void>(() => undefined);

/** Mounted once in the dashboard layout. Any screen opens the dialog with useNewRequest(). */
export function NewRequestProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; prefill: NewRequestPrefill; run: number }>({ open: false, prefill: {}, run: 0 });
  const open = useCallback((prefill: NewRequestPrefill = {}) => setState((s) => ({ open: true, prefill, run: s.run + 1 })), []);
  return (
    <NewRequestContext.Provider value={open}>
      {children}
      {/* Keyed per opening so the form starts fresh each time. */}
      <NewRequestDialog key={state.run} open={state.open} prefill={state.prefill} onClose={() => setState((s) => ({ ...s, open: false }))} />
    </NewRequestContext.Provider>
  );
}

/** `const newRequest = useNewRequest(); <button onClick={() => newRequest()}>` */
export const useNewRequest = () => useContext(NewRequestContext);
