import { toast, type ExternalToast } from 'svelte-sonner';

export type NotificationTone = 'info' | 'success' | 'warning' | 'error';

/** Pass an id to update an existing notification instead of adding another. */
export function notify(
  message: string,
  tone: NotificationTone = 'info',
  options: ExternalToast = {},
) {
  return toast[tone](message, options);
}

export function dismissNotification(id?: string | number) {
  return toast.dismiss(id);
}
