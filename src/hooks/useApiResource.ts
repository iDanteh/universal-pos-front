import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/api/client";

export interface ApiResource<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
}

/**
 * Centralized async resource loading: single pattern for every screen.
 * Guarantees:
 *  - errors surface as ApiError (typed; component calls userMessage);
 *  - late responses after unmount never clobber state;
 *  - reload() retries the request in place.
 */
export function useApiResource<T>(fetcher: () => Promise<T>): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (requestId.current === current) {
        setData(result);
      }
    } catch (cause) {
      if (requestId.current === current && cause instanceof ApiError) {
        setError(cause);
      }
    } finally {
      if (requestId.current === current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1; // invalidate on unmount
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload };
}
