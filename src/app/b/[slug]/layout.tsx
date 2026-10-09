import type { ReactNode } from "react";
import { NotebookGate } from "@/components/book/NotebookGate";

export default async function BookLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <NotebookGate slug={slug}>{children}</NotebookGate>;
}
