import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlogPost } from "@/content/blog";
import RegisterPage from "../../page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, alternates: { canonical: "https://mediaory.io/register" } };

export default async function BlogRegistration({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getBlogPost(slug)) notFound();
  return <RegisterPage searchParams={Promise.resolve({ blog: slug })} />;
}
