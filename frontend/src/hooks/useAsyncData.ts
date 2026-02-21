import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncDataState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Tiny async helper hook.
 * - Handles loading + error state
 * - Cancels state updates after unmount
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const latestLoader = useRef(loader);
  latestLoader.current = loader;

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await latestLoader.current();
      setData(result);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await loader();
        if (isActive) setData(result);
      } catch (err) {
        if (isActive) setError(err as Error);
      } finally {
        if (isActive) setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, isLoading, error, refetch };
}