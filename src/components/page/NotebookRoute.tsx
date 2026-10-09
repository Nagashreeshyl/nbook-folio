"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { NotebookShell, type NotebookMode } from "@/components/book/NotebookShell";
import { PageView } from "@/components/page/PageView";
import { DrawerSkeleton, PageSkeleton } from "@/components/ui/States";

function Route({ mode }: { mode: NotebookMode }) {
  const searchParams = useSearchParams();
  const requestedPageId = searchParams.get("page");

  return (
    <NotebookShell mode={mode} requestedPageId={requestedPageId}>
      <PageView mode={mode} requestedPageId={requestedPageId} />
    </NotebookShell>
  );
}

export function NotebookRoute({ mode }: { mode: NotebookMode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh">
          <div className="hidden lg:block w-[266px] border-e border-rule bg-sheet/50">
            <DrawerSkeleton />
          </div>
          <div className="flex-1 px-4 py-8 lg:px-10">
            <PageSkeleton />
          </div>
        </div>
      }
    >
      <Route mode={mode} />
    </Suspense>
  );
}
