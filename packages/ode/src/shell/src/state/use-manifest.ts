import { useEffect, useState } from "react";
import { MANIFEST_URL } from "@/lib/constants";
import type { Manifest } from "@/lib/types";

export interface ManifestState {
  manifest: Manifest | undefined;
  error: string | undefined;
  isLoading: boolean;
  refetch: () => void;
}

const fetchManifest = async (): Promise<Manifest> => {
  const response = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Manifest fetch failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as Manifest;
};

export const useManifest = (): ManifestState => {
  const [manifest, setManifest] = useState<Manifest | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [refetchToken, setRefetchToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchManifest()
      .then((next) => {
        if (cancelled) return;
        setManifest(next);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refetchToken]);

  return {
    manifest,
    error,
    isLoading,
    refetch: () => setRefetchToken((token) => token + 1),
  };
};
