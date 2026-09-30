import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, extractTitle, htmlToPlainText } from "./html-text";

describe("htmlToPlainText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToPlainText("<p>Hello &amp; welcome, <b>friend</b>.</p>")).toBe("Hello & welcome, friend .");
  });

  it("removes script, style, and iframe content entirely (not just the tags)", () => {
    const html =
      '<div>Visible</div><script>alert("xss")</script><style>.x{color:red}</style><iframe src="evil"></iframe>';
    const text = htmlToPlainText(html);
    expect(text).toBe("Visible");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color");
  });

  it("strips tags carrying an event-handler attribute", () => {
    const text = htmlToPlainText('<div onclick="steal()">Click me</div>');
    expect(text).not.toContain("steal");
  });

  it("strips HTML comments", () => {
    expect(htmlToPlainText("<p>Before<!-- secret -->After</p>")).toBe("Before After");
  });

  it("converts block-level closings to newlines without collapsing paragraphs into one line", () => {
    const text = htmlToPlainText("<p>First paragraph.</p><p>Second paragraph.</p>");
    expect(text.split("\n").map((l) => l.trim())).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("handles numeric character references", () => {
    expect(htmlToPlainText("Caf&#233; &#x2014; nice")).toBe("Café — nice");
  });

  it("excludes <head> content (title/meta/etc.) from a full-page fetch", () => {
    const html = "<html><head><title>Page Title</title><meta name=\"x\" content=\"y\"/></head>" +
      "<body><p>Visible body.</p></body></html>";
    expect(htmlToPlainText(html)).toBe("Visible body.");
  });

  it("never leaves a tag-shaped literal in the output, even when the source entity-encoded it", () => {
    // <script>/&lt;script&gt; wouldn't be present as a real <...> token
    // until after entities are decoded — this proves the decode step
    // doesn't reintroduce what the earlier strip passes just removed.
    const text = htmlToPlainText("<p>Hello &lt;script&gt;alert(1)&lt;/script&gt; world</p>");
    expect(text).not.toMatch(/<[a-z][^>]*>/i);
    expect(text).toBe("Hello alert(1) world");
  });

  it("preserves entity-encoded comparison text instead of swallowing everything between it as a fake tag", () => {
    // Regression: the entity-decode pass turns "&lt;"/"&gt;" into literal
    // "<"/">" — common in financial/media text ("EPS < $0.50"), not just
    // in fake tags. The tag-shaped strip that runs after decoding used to
    // be a bare `<[^>]+>`, which matched from that unrelated "<" all the
    // way to the next unrelated ">" anywhere later in the string, deleting
    // everything in between instead of leaving the comparison text alone.
    const html =
      "<p>Analysts expect EPS &lt; $0.50 while revenue is projected to exceed $2B this quarter, beating &gt;consensus.</p>";
    expect(htmlToPlainText(html)).toBe(
      "Analysts expect EPS < $0.50 while revenue is projected to exceed $2B this quarter, beating >consensus.",
    );
  });
});

describe("decodeHtmlEntities", () => {
  it("leaves unknown entities untouched rather than guessing", () => {
    expect(decodeHtmlEntities("A &notarealentity; B")).toBe("A &notarealentity; B");
  });
});

describe("extractTitle", () => {
  it("prefers og:title over <title>", () => {
    const html = '<head><meta property="og:title" content="OG Title"/><title>Page Title</title></head>';
    expect(extractTitle(html)).toBe("OG Title");
  });

  it("falls back to <title>", () => {
    expect(extractTitle("<head><title>Only Title &amp; More</title></head>")).toBe("Only Title & More");
  });

  it("returns null when neither is present", () => {
    expect(extractTitle("<body>No title here</body>")).toBeNull();
  });

  it("never returns a tag-shaped literal, even when the source entity-encoded it", () => {
    const title = extractTitle("<head><title>Breaking: &lt;script&gt;alert(1)&lt;/script&gt;</title></head>");
    expect(title).not.toMatch(/<[a-z][^>]*>/i);
    expect(title).toBe("Breaking: alert(1)");
  });

  it("preserves entity-encoded comparison text in a title instead of swallowing it", () => {
    const title = extractTitle("<head><title>Q1 EPS &lt; $0.50, revenue &gt; $2B</title></head>");
    expect(title).toBe("Q1 EPS < $0.50, revenue > $2B");
  });
});
