import type { Metadata } from "next";
import { NotebookRoute } from "@/components/page/NotebookRoute";

export const metadata: Metadata = { title: "Edit · NBOOK" };

export default function EditPage() {
  return <NotebookRoute mode="edit" />;
}
