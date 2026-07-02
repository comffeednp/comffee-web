import { describe, expect, it } from "vitest";
import { mdToSafeHtml } from "./markdown";

// Guards the stored-XSS fix (audit 2026-07-02): partner/owner description_md is rendered
// with dangerouslySetInnerHTML on public pages, so the sanitizer must strip anything
// executable while keeping normal formatting. These cases must hold regardless of which
// sanitizer library backs mdToSafeHtml.
describe("mdToSafeHtml", () => {
  it("strips <script> blocks embedded in markdown", () => {
    const out = mdToSafeHtml('hello\n\n<script>alert("xss")</script>\n\nworld');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("hello");
    expect(out).toContain("world");
  });

  it("strips javascript: hrefs", () => {
    const out = mdToSafeHtml("[click](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
  });

  it("strips inline event handlers", () => {
    const out = mdToSafeHtml('<img src="x.png" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  it("strips iframes", () => {
    const out = mdToSafeHtml('<iframe src="https://evil.example"></iframe>');
    expect(out).not.toContain("<iframe");
  });

  it("keeps normal formatting: headings, bold, lists, safe links, images", () => {
    const out = mdToSafeHtml(
      "# Title\n\n**bold** and a [link](https://comffee.org)\n\n- one\n- two\n\n![pic](https://comffee.org/p.jpg)",
    );
    expect(out).toContain("<h1");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain('href="https://comffee.org"');
    expect(out).toContain("<li>one</li>");
    expect(out).toContain('<img src="https://comffee.org/p.jpg"');
  });
});
