import type { Metadata } from "next";
import { DemoNotebook } from "@/components/demo/DemoNotebook";

export const metadata: Metadata = { title: "Explore demo · NBOOK" };

export default function DemoPage() {
  return <DemoNotebook />;
}
