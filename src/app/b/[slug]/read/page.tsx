import type { Metadata } from "next";
import { NotebookRoute } from "@/components/page/NotebookRoute";

export const metadata: Metadata = { title: "Read · NBOOK" };

export default function ReadPage() {
  return <NotebookRoute mode="read" />;
}
