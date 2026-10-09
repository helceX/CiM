import { describe, expect, it, vi } from "vitest";
import type { Db } from "../client";
import { insertArticle, insertArticleWithOutcome } from "./articles";

const input = {
  sourceId: "source",
  canonicalUrl: "https://example.com/story",
  contentHash: "hash",
  title: "A recent headline",
  storedExcerpt: null,
  language: null,
  publishedAt: null,
  authorName: null,
};

function database(inserted: object[], existing: object[] = []) {
  const returning = vi.fn().mockResolvedValue(inserted);
  const limit = vi.fn().mockResolvedValue(existing);
  const insert = vi.fn().mockReturnValue({
    values: () => ({ onConflictDoNothing: () => ({ returning }) }),
  });
  const select = vi.fn().mockReturnValue({
    from: () => ({ where: () => ({ limit }) }),
  });
  return { db: { insert, select } as unknown as Db, select };
}

describe("insertArticleWithOutcome", () => {
  it("marks a successful insertion as created without another lookup", async () => {
    const article = { id: "new" };
    const { db, select } = database([article]);
    expect(await insertArticleWithOutcome(db, input)).toEqual({
      article,
      created: true,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("marks the row returned after a uniqueness conflict as existing", async () => {
    const article = { id: "winner" };
    const { db } = database([], [article]);
    expect(await insertArticleWithOutcome(db, input)).toEqual({
      article,
      created: false,
    });
  });

  it("does not report a successful ingest when the conflict row cannot be found", async () => {
    const { db } = database([]);
    await expect(insertArticleWithOutcome(db, input)).rejects.toThrow(
      "Failed to insert article",
    );
  });

  it("keeps the existing insertArticle API returning just the article", async () => {
    const article = { id: "winner" };
    const { db } = database([], [article]);
    expect(await insertArticle(db, input)).toBe(article);
  });
});
