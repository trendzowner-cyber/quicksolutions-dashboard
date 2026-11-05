// Client-side web push helpers — safe to import from any UI component.

let swPromise: Promise<ServiceWorkerRegistration> | null = null;

/** VAPID applicationServerKey: URL-safe base64 → Uint8Array. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const standard = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(standard);
  // Explicit ArrayBuffer so the result satisfies PushManager.subscribe's
  // BufferSource param (a SharedArrayBuffer-backed view would not).
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// One registration no matter how many components ask for it. ActivityBell is
// mounted twice on staff pages (desktop header + mobile nav, hidden via CSS)
// and two competing registrations flap the service-worker controller.
export function registerSW(): Promise<ServiceWorkerRegistration> {
  if (!swPromise) {
    swPromise = navigator.serviceWorker.register("/sw.js").catch((error) => {
      swPromise = null; // allow a retry on the next call
      throw error;
    });
  }
  return swPromise;
}
