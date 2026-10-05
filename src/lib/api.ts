'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: Record<string, unknown> | null) {
    super(message);
  }
}

/** JSON fetch with consistent errors. Redirects to sign-in when the session has ended. */
export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: 'no-store',
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error;
    if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/portal') && !url.startsWith('/api/auth')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(err?.code ?? 'HTTP', err?.message ?? `Request failed (${res.status}).`, res.status, err?.details ?? null);
  }
  return data as T;
}

/**
 * Loads data and optionally re-polls it. Polling pauses while the tab is
 * hidden so idle desks do not hammer the server.
 */
export function useLoad<T>(url: string | null, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const reload = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const d = await api<T>(u);
      if (urlRef.current === u) {
        setData(d);
        setError(null);
        setLoadedAt(new Date());
      }
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('NETWORK', 'Could not reach Aksen. Check your connection.', 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    setLoading(true);
    reload();
    if (!opts.pollMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, opts.pollMs);
    const onVis = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [url, opts.pollMs, reload]);

  return { data, setData, error, loading, reload, loadedAt };
}
