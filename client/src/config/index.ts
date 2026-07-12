/**
 * Central client config and feature flags.
 */

function getServerUrl(): string {
  const envUrl = (import.meta as unknown as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL;
  if (envUrl) return envUrl;
  // Auto-detect: if served from same origin, use that (production deploy)
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return "ws://localhost:2567";
}

export const clientConfig = {
  /** Server URL for Colyseus */
  serverUrl: getServerUrl(),

  /** Enable debug overlay */
  debugOverlay: true,

  /** Log level: "error" | "warn" | "info" | "debug" */
  logLevel: "info" as const,

  /** GLB URLs for player (FPS view model) and dummies. Override via .env: VITE_PLAYER_MODEL_URL, VITE_DUMMY_MODEL_URL */
  playerModelUrl: (import.meta as unknown as { env?: { VITE_PLAYER_MODEL_URL?: string } }).env?.VITE_PLAYER_MODEL_URL ?? "/models/player.glb",
  dummyModelUrl: (import.meta as unknown as { env?: { VITE_DUMMY_MODEL_URL?: string } }).env?.VITE_DUMMY_MODEL_URL ?? "/models/dummy.glb",
};
