import { useState, useEffect, useCallback } from "react";

import { useAuthStore } from "@/store/auth";

export const fetchAPI = async (endpoint: string, options?: RequestInit) => {
  const token = useAuthStore.getState().token;

  try {
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL}${endpoint}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options?.headers || {}),
        },
        ...options,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Something went wrong");
    }

    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
};

export function useFetch<T>(endpoint: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
  if (!endpoint) {
    setData(null);
    setLoading(false);
    return;
  }

  setLoading(true);
  setError(null);

  try {
    const result = await fetchAPI(endpoint);
    setData(result.data ?? result);
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setLoading(false);
  }
}, [endpoint]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
