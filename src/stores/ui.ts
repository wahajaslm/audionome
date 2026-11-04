import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ToastState {
  message: string;
  /** Optional single action, e.g. "View". */
  actionLabel?: string;
  /** Route the action opens, e.g. '/moments'. */
  actionTo?: string;
}

/** Toasts and other app-wide UI state. View state lives in the router. */
export const useUiStore = defineStore('ui', () => {
  const toast = ref<ToastState | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Toast rule: one sentence, at most one action, gone after 5 s. */
  function notify(message: string, actionLabel?: string, actionTo?: string): void {
    toast.value = { message, actionLabel, actionTo };
    clearTimeout(timer);
    timer = setTimeout(() => { toast.value = null; }, 5000);
  }

  function dismissToast(): void {
    clearTimeout(timer);
    toast.value = null;
  }

  return { toast, notify, dismissToast };
});
