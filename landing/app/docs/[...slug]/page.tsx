import { notFound } from "next/navigation";
import { DocsRoutePage } from "@/components/docs-route-page";
import { docsPages, findDocsPage } from "@/lib/docs-pages";

type SlugParams = {
  slug: string[];
};

type PageProps = {
  params: Promise<SlugParams>;
};

export function generateStaticParams() {
  return docsPages.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const page = findDocsPage(slug);

  if (!page) {
    return {};
  }

  return {
    title: `${page.title} | Signal`,
    description: page.summary,
  };
}

export default async function DocsSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const page = findDocsPage(slug);

  if (!page) {
    notFound();
  }

  return (
    <DocsRoutePage
      eyebrow={page.eyebrow}
      title={page.title}
      summary={page.summary}
      canonicalHref={page.canonicalHref}
      primaryLabel={page.primaryLabel}
      primaryHref={page.primaryHref}
    >
      {page.body}
    </DocsRoutePage>
  );
}
