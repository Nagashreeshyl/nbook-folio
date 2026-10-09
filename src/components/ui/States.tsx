"use client";

import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-sheet-hover ${className}`}
      aria-hidden="true"
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="w-full max-w-[880px] tactile-folio-sheet rounded-lg p-8 sm:p-12 space-y-6">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function DrawerSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-6 w-40" />
      <div className="space-y-2 pt-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-14 px-6 max-w-md mx-auto">
      <span className="material-symbols-outlined text-amber/60 text-[40px] mb-3 block">
        {icon}
      </span>
      <h3 className="font-serif text-[19px] text-ink font-medium mb-1.5">{title}</h3>
      {description && (
        <p className="font-sans text-[13px] text-ink-faint leading-relaxed mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="text-center py-12 px-6 max-w-md mx-auto bg-sheet border border-rule rounded-lg"
    >
      <span className="material-symbols-outlined text-danger text-[34px] mb-2 block">error</span>
      <h3 className="font-serif text-[18px] text-ink font-medium mb-1.5">{title}</h3>
      {description && (
        <p className="font-sans text-[13px] text-ink-muted leading-relaxed mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
