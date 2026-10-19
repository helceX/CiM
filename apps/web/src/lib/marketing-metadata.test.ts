import { expect, it } from "vitest";
import { marketingMetadata, MARKETING_PATHS } from "./marketing-metadata";

it("gives every public product page a distinct title, description and self canonical", async () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const page of Object.keys(MARKETING_PATHS) as (keyof typeof MARKETING_PATHS)[]) {
    const metadata = await marketingMetadata(page);
    expect(metadata.alternates?.canonical).toBe(
      `https://mediaory.io${MARKETING_PATHS[page]}`,
    );
    expect(metadata.title).not.toMatch(/^meta\./);
    expect(metadata.description?.length).toBeGreaterThan(40);
    titles.add(metadata.title);
    descriptions.add(metadata.description);
  }
  expect(titles.size).toBe(Object.keys(MARKETING_PATHS).length);
  expect(descriptions.size).toBe(titles.size);
});
