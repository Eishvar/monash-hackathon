"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api";

interface Slot<T> {
  key: string;
  data?: T;
  error?: string;
}

/** GET a backend path. `loading` is derived (no data for the current key yet), so effects never set state synchronously. */
export function useApi<T>(path: string | null) {
  const [tick, setTick] = useState(0);
  const [slot, setSlot] = useState<Slot<T> | null>(null);
  const key = path === null ? null : `${path}#${tick}`;

  useEffect(() => {
    if (path === null || key === null) return;
    let cancelled = false;
    apiGet<T>(path)
      .then((data) => !cancelled && setSlot({ key, data }))
      .catch((e: Error) => !cancelled && setSlot({ key, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const current = slot && slot.key === key ? slot : null;
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {
    // keep showing the previous data while a reload is in flight
    data: (current ?? slot)?.data ?? null,
    error: current?.error ?? null,
    loading: key !== null && current === null,
    reload,
  };
}
