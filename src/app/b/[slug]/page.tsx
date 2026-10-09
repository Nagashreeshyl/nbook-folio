import { redirect } from "next/navigation";

export default async function BookIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/b/${slug}/read`);
}
