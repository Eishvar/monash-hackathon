"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api";

interface Slot<T> {
  path: string;
  key: string;
  data?: T;
  error?: string;
}

/**
 * GET a backend path. `loading` is derived (no result for the current key yet), so effects never set state synchronously.
 * While a reload of the SAME path is in flight the previous data stays visible; data for a different path never does.
 */
export function useApi<T>(path: string | null) {
  const [tick, setTick] = useState(0);
  const [slot, setSlot] = useState<Slot<T> | null>(null);
  const key = path === null ? null : `${path}#${tick}`;

  useEffect(() => {
    if (path === null || key === null) return;
    let cancelled = false;
    apiGet<T>(path)
      .then((data) => !cancelled && setSlot({ path, key, data }))
      .catch((e: Error) => !cancelled && setSlot({ path, key, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const current = slot && slot.key === key ? slot : null;
  const samePath = slot && slot.path === path ? slot : null;
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {
    data: (current ?? samePath)?.data ?? null,
    error: current?.error ?? null,
    loading: key !== null && current === null,
    reload,
  };
}
