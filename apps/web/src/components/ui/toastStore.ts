/** Toast store (pure, `useSyncExternalStore`-compatible): array + listeners, no React import. */

export type ToastKind = "success" | "error" | "info" | "pending";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  /** Transaction signature — rendered as a devnet explorer link by `<Toaster />`. */
  tx?: string;
};

export type ToastInput = Omit<Toast, "id"> & { id?: string };

export type ToastPatch = Partial<Omit<Toast, "id">>;

export type ToastStore = {
  /** Add a toast; an explicit `id` replaces an existing toast with that id. Returns the id. */
  push: (input: ToastInput) => string;
  /** Merge a patch into the toast with `id` (e.g. pending → success). */
  update: (id: string, patch: ToastPatch) => void;
  dismiss: (id: string) => void;
  /** `useSyncExternalStore` glue: notify on every change. */
  subscribe: (onStoreChange: () => void) => () => void;
  /** Stable snapshot (same reference until the store changes). */
  list: () => Toast[];
};

export function createToastStore(): ToastStore {
  let items: Toast[] = [];
  let snapshot: Toast[] = [];
  const listeners = new Set<() => void>();
  let seq = 0;
  const commit = () => {
    snapshot = items;
    for (const l of listeners) l();
  };
  return {
    push(input) {
      const id = input.id ?? `toast-${++seq}`;
      items = [...items.filter((t) => t.id !== id), { ...input, id }];
      commit();
      return id;
    },
    update(id, patch) {
      items = items.map((t) => (t.id === id ? { ...t, ...patch, id } : t));
      commit();
    },
    dismiss(id) {
      items = items.filter((t) => t.id !== id);
      commit();
    },
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    list: () => snapshot,
  };
}

/** App-wide singleton used by `toast()` and `<Toaster />`. */
export const toastStore = createToastStore();

/** `toast({ kind, title, ... }) → id`; `toast.update(id, patch)`; `toast.dismiss(id)`. */
export const toast: {
  (input: ToastInput): string;
  update: (id: string, patch: ToastPatch) => void;
  dismiss: (id: string) => void;
} = Object.assign((input: ToastInput) => toastStore.push(input), {
  update: (id: string, patch: ToastPatch) => toastStore.update(id, patch),
  dismiss: (id: string) => toastStore.dismiss(id),
});
