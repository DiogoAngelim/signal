/**
 * Signal React Hooks
 *
 * All hooks use the API client as the sole data source.
 * No direct fetch calls. No hardcoded domain data.
 */

import { useState, useEffect, useCallback } from "react";
import * as api from "../api/client";
import type { SignalResult, SignalError, SignalCapabilities } from "../../../contracts/domain-types";

// ─── useCapabilities ────────────────────────────────────────────

export function useCapabilities() {
  const [result, setResult] = useState<SignalResult<SignalCapabilities> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SignalError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getCapabilities();
      setResult(r);
      if (!r.ok) setError(r.error);
    } catch (e) {
      setError({ code: "TRANSPORT_ERROR", category: "transport", message: String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { result, loading, error, refresh };
}

// ─── useSignalQuery ─────────────────────────────────────────────

export function useSignalQuery<T>(name: string, input: unknown, options?: { enabled?: boolean }) {
  const [result, setResult] = useState<SignalResult<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SignalError | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.signalQuery<T>(name, input);
      setResult(r);
      if (!r.ok) setError(r.error);
    } catch (e) {
      setError({ code: "TRANSPORT_ERROR", category: "transport", message: String(e) });
    } finally {
      setLoading(false);
    }
  }, [name, input]);

  useEffect(() => {
    if (options?.enabled !== false) execute();
  }, [execute, options?.enabled]);

  return { result, loading, error, refetch: execute };
}

// ─── useSignalMutation ──────────────────────────────────────────

export function useSignalMutation<T>(name: string) {
  const [result, setResult] = useState<SignalResult<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SignalError | null>(null);

  const execute = useCallback(async (input: unknown, idempotencyKey?: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.signalMutation<T>(name, input, idempotencyKey);
      setResult(r);
      if (!r.ok) setError(r.error);
    } catch (e) {
      setError({ code: "TRANSPORT_ERROR", category: "transport", message: String(e) });
    } finally {
      setLoading(false);
    }
  }, [name]);

  return { result, loading, error, execute };
}