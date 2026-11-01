import {
  listen as tauriListen,
  type Event,
  type EventCallback,
  type UnlistenFn,
} from "@tauri-apps/api/event";

type Subscriber = (event: Event<unknown>) => void;

const subscribers = new Map<string, Set<Subscriber>>();
const unlisteners = new Map<string, UnlistenFn>();
const startingListeners = new Map<string, Promise<void>>();
const cleanupTimers = new Map<string, number>();

async function ensureListener(eventName: string): Promise<void> {
  if (unlisteners.has(eventName)) return;

  let starting = startingListeners.get(eventName);
  if (!starting) {
    starting = tauriListen<unknown>(eventName, (event) => {
      for (const subscriber of [...(subscribers.get(eventName) ?? [])]) {
        try {
          subscriber(event);
        } catch (error) {
          console.error(`A ${eventName} event handler failed.`, error);
        }
      }
    }).then((unlisten) => {
      if (subscribers.get(eventName)?.size) {
        unlisteners.set(eventName, unlisten);
      } else {
        unlisten();
      }
    });
    startingListeners.set(eventName, starting);
  }

  try {
    await starting;
  } finally {
    if (startingListeners.get(eventName) === starting) {
      startingListeners.delete(eventName);
    }
  }
}

function scheduleUnlisten(eventName: string): void {
  if (cleanupTimers.has(eventName)) return;

  const timer = window.setTimeout(() => {
    cleanupTimers.delete(eventName);
    if (subscribers.get(eventName)?.size) return;

    subscribers.delete(eventName);
    const unlisten = unlisteners.get(eventName);
    if (!unlisten) return;

    unlisteners.delete(eventName);
    unlisten();
  }, 0);
  cleanupTimers.set(eventName, timer);
}

export async function listenSidecar<T>(
  eventName: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  const subscriber: Subscriber = (event) =>
    handler({ ...event, payload: event.payload as T });
  let eventSubscribers = subscribers.get(eventName);
  if (!eventSubscribers) {
    eventSubscribers = new Set();
    subscribers.set(eventName, eventSubscribers);
  }
  eventSubscribers.add(subscriber);

  const cleanupTimer = cleanupTimers.get(eventName);
  if (cleanupTimer !== undefined) {
    window.clearTimeout(cleanupTimer);
    cleanupTimers.delete(eventName);
  }

  try {
    await ensureListener(eventName);
  } catch (error) {
    eventSubscribers.delete(subscriber);
    if (eventSubscribers.size === 0) scheduleUnlisten(eventName);
    throw error;
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    eventSubscribers.delete(subscriber);
    if (eventSubscribers.size === 0) scheduleUnlisten(eventName);
  };
}
