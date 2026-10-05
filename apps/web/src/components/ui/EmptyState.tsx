import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-n300 bg-n0 px-6 py-10 text-center">
      <div className="text-base font-bold">{title}</div>
      {body && (
        <p className="mx-auto mt-1 max-w-md text-sm text-n600">{body}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
