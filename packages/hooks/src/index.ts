import { useCallback, useEffect, useState } from "react";
import { createMessage, pingBackground } from "@wvp/messaging";
import type { RegressionReport, TabInfo, VitalMetric, VitalsSnapshot } from "@wvp/types";
import { useVitalsStore } from "./vitals-store";

export { useVitalsStore } from "./vitals-store";

/** Hook to verify background service worker connectivity. */
export function useExtensionStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkConnection = useCallback(async () => {
    setIsLoading(true);
    const connected = await pingBackground();
    setIsConnected(connected);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  return { isConnected, isLoading, checkConnection };
}

/** Hook to fetch current active tab info from the background worker. */
export function useActiveTab() {
  const [tabInfo, setTabInfo] = useState<TabInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTabInfo() {
      setIsLoading(true);
      try {
        const response = await chrome.runtime.sendMessage(createMessage("GET_TAB_INFO"));
        if (response?.success && response.data) {
          setTabInfo(response.data as TabInfo);
        }
      } catch {
        setTabInfo(null);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchTabInfo();
  }, []);

  return { tabInfo, isLoading };
}

/** Hook exposing extension version from the manifest. */
export function useExtensionVersion(): string {
  return chrome.runtime.getManifest().version;
}

/** Subscribes to live vitals for the active tab. */
export function useVitals() {
  const { snapshot, setSnapshot } = useVitalsStore();

  useEffect(() => {
    async function fetchVitals() {
      try {
        const response = await chrome.runtime.sendMessage(createMessage("GET_VITALS"));
        if (response?.success && response.data) {
          setSnapshot(response.data as VitalsSnapshot);
        }
      } catch {
        /* background may be inactive */
      }
    }

    void fetchVitals();

    const listener = (message: { type?: string; payload?: VitalsSnapshot }) => {
      if (message?.type === "VITALS_UPDATE" || message?.payload?.metrics) {
        setSnapshot(message.payload as VitalsSnapshot);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [setSnapshot]);

  return { snapshot, metrics: snapshot?.metrics ?? {} };
}

/** Fetches vitals history from IndexedDB. */
export function useVitalsHistory(url?: string) {
  const { history, setHistory } = useVitalsStore();

  useEffect(() => {
    async function fetchHistory() {
      const response = await chrome.runtime.sendMessage(
        createMessage("GET_VITALS_HISTORY", { url, limit: 100 }),
      );
      if (response?.success && response.data) {
        setHistory(response.data as VitalMetric[]);
      }
    }
    void fetchHistory();
  }, [url, setHistory]);

  return history;
}

/** Fetches regression reports for a URL. */
export function useRegressions(url?: string) {
  const { regressions, setRegressions } = useVitalsStore();

  useEffect(() => {
    if (!url) return;
    async function fetchRegressions() {
      const response = await chrome.runtime.sendMessage(
        createMessage("GET_REGRESSIONS", { url }),
      );
      if (response?.success && response.data) {
        setRegressions(response.data as RegressionReport[]);
      }
    }
    void fetchRegressions();
  }, [url, setRegressions]);

  return regressions;
}

/** Toggles the on-page vitals overlay. */
export async function toggleOverlay(enabled: boolean): Promise<void> {
  await chrome.runtime.sendMessage(createMessage("OVERLAY_TOGGLE", { enabled }));
  useVitalsStore.getState().setOverlayEnabled(enabled);
}

/** Exports a performance report. */
export async function exportReport(
  format: "json" | "csv" | "html",
  url?: string,
  sendSlack?: boolean,
): Promise<string | null> {
  const response = await chrome.runtime.sendMessage(
    createMessage("EXPORT_REPORT", { format, url, sendSlack }),
  );
  if (response?.success && response.data) {
    return (response.data as { content: string }).content;
  }
  return null;
}
