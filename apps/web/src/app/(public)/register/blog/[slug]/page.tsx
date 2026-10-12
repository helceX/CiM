import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { validBlogSource } from "@/lib/blog-attribution";
import RegisterPage from "../../page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, alternates: { canonical: "https://mediaory.io/register" } };

export default async function BlogRegistration({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!validBlogSource(slug)) notFound();
  return <RegisterPage searchParams={Promise.resolve({ blog: slug })} />;
}
