import { Reveal } from "./reveal";

/** `body` paragraphs come first, then the bullet `items`, then the closing `after` paragraphs. */
export type LegalSection = { title: string; body: string[]; items?: string[]; after?: string[] };

/** Long-form legal/policy text: numbered sections, readable line length. */
export function LegalDocument({ sections, updated }: { sections: LegalSection[]; updated?: string }) {
  return (
    <section className="mk-section pt-6">
      <div className="mk-wrap max-w-3xl">
        {updated ? <p className="text-sm text-[var(--mk-muted)]">{updated}</p> : null}
        <ol className="mt-8 flex flex-col gap-10">
          {sections.map((section, index) => (
            <Reveal as="li" key={section.title}>
              <h2 className="text-2xl font-extrabold">
                <span aria-hidden="true" className="mr-2 text-[var(--mk-cyan)]">
                  {index + 1}.
                </span>
                {section.title}
              </h2>
              <div className="mt-3 flex flex-col gap-3 text-[var(--mk-muted)]">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items?.length ? (
                  <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-[var(--mk-cyan)]">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {section.after?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
