type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitFullscreenEnabled?: boolean;
  permissionsPolicy?: { allowsFeature(name: string): boolean };
  featurePolicy?: { allowsFeature(name: string): boolean };
};
interface FullscreenDiagnostic {
  stage: string;
  timestamp: string;
  [key: string]: unknown;
}
declare global {
  interface Window {
    orpheusFullscreenDiagnostics?: FullscreenDiagnostic[];
  }
}

export function recordFullscreen(
  stage: string,
  element: HTMLElement,
  details: Record<string, unknown> = {},
) {
  const doc = document as FullscreenDocument;
  const bounds = element.getBoundingClientRect();
  const entry: FullscreenDiagnostic = {
    stage,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    userActivation: navigator.userActivation?.isActive ?? null,
    fullscreenEnabled: doc.fullscreenEnabled ?? null,
    webkitFullscreenEnabled: doc.webkitFullscreenEnabled ?? null,
    fullscreenElement:
      (doc.fullscreenElement ?? doc.webkitFullscreenElement)?.tagName ?? null,
    policyAllowsFullscreen:
      (doc.permissionsPolicy ?? doc.featurePolicy)?.allowsFeature(
        'fullscreen',
      ) ?? null,
    secureContext: window.isSecureContext,
    topLevel: window === window.top,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    visibility: document.visibilityState,
    focused: document.hasFocus(),
    connected: element.isConnected,
    display: getComputedStyle(element).display,
    width: bounds.width,
    height: bounds.height,
    ...details,
  };
  const entries = (window.orpheusFullscreenDiagnostics ??= []);
  entries.push(entry);
  if (entries.length > 100) entries.splice(0, entries.length - 100);
  console.info('[Orpheus fullscreen]', entry);
}

function errorDetails(error: unknown) {
  const value = error as { name?: unknown; message?: unknown } | null;
  return {
    errorName: typeof value?.name === 'string' ? value.name : 'Unknown',
    errorMessage:
      typeof value?.message === 'string' ? value.message : String(error),
  };
}

export function requestFullscreenWithDiagnostics(element: FullscreenElement) {
  const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
  if (!request) {
    recordFullscreen('unsupported', element);
    return () => {};
  }
  const started = performance.now();
  const method =
    typeof element.requestFullscreen === 'function'
      ? 'requestFullscreen'
      : 'webkitRequestFullscreen';
  let disposed = false;
  let settled = false;
  const record = (stage: string, details: Record<string, unknown> = {}) => {
    if (!disposed)
      recordFullscreen(stage, element, {
        method,
        elapsedMs: Math.round(performance.now() - started),
        ...details,
      });
  };
  const changed = () => record('fullscreenchange');
  const errored = () => record('fullscreenerror');
  const events = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'fullscreenerror',
    'webkitfullscreenerror',
  ];
  for (const event of events)
    document.addEventListener(
      event,
      event.endsWith('error') ? errored : changed,
    );
  const deadline = setTimeout(() => {
    if (!settled) record('pending-after-3s');
  }, 3000);
  record('request');
  try {
    const result = request.call(element);
    if (result && typeof result.then === 'function') {
      void result.then(
        () => {
          settled = true;
          clearTimeout(deadline);
          record('resolved');
        },
        (error: unknown) => {
          settled = true;
          clearTimeout(deadline);
          record('rejected', errorDetails(error));
        },
      );
    } else {
      settled = true;
      clearTimeout(deadline);
      record('returned-without-promise');
    }
  } catch (error) {
    settled = true;
    clearTimeout(deadline);
    record('threw', errorDetails(error));
  }
  return () => {
    if (!settled) record('observation-ended-while-pending');
    disposed = true;
    clearTimeout(deadline);
    for (const event of events)
      document.removeEventListener(
        event,
        event.endsWith('error') ? errored : changed,
      );
  };
}
