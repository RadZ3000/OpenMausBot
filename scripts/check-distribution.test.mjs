import { describe, expect, it } from "vitest";

import { upstreamRefs } from "./check-distribution.mjs";

describe("upstreamRefs", () => {
  it("finds each kind of upstream endpoint", () => {
    const hits = upstreamRefs(
      [
        "    owner: milind-soni",
        "    repo: openmausbot-releases",
        'const BROKER = "https://openmausbot-composio.milindsoni201.workers.dev";',
        'export const TEAM_LIBRARY = "https://github.com/milind-soni/openmausbot-teams";',
      ].join("\n"),
    );
    expect(hits.map((hit) => hit.line)).toEqual([1, 2, 3, 4]);
  });

  it("reports the line number, not just the count", () => {
    const [hit] = upstreamRefs(["clean", "clean", "  repo: openmausbot-releases"].join("\n"));
    expect(hit.line).toBe(3);
    expect(hit.text).toBe("repo: openmausbot-releases");
  });

  // The whole point of narrow markers: these identify the app to itself, and
  // renaming one strands installs rather than rebranding anything.
  // See docs/identity-surface.md §2.
  it("leaves the names that must survive a rebrand alone", () => {
    const text = [
      'const DATA_DIR = join(homedir(), ".openmausbot");',
      'if (url.protocol === "openmausbot:") handlePair(url);',
      'browser.start({ type: "_openmausbot._tcp" });',
      'if (root.format !== "openmaus.team") throw new Error("not a team file");',
      "appId: com.openmausbot.app",
      'localStorage.getItem("omb-analytics-consent");',
    ].join("\n");
    expect(upstreamRefs(text)).toEqual([]);
  });

  it("matches the account name whatever its case", () => {
    expect(upstreamRefs("Milind Soni <46266943+milind-soni@users.noreply.github.com>")).toHaveLength(1);
  });

  it("counts a line once even when it names upstream twice", () => {
    expect(upstreamRefs("https://github.com/milind-soni/openmausbot-releases")).toHaveLength(1);
  });

  it("reads CRLF the same as LF", () => {
    expect(upstreamRefs("clean\r\n  owner: milind-soni\r\n")).toEqual([
      { line: 2, what: "upstream's GitHub account", text: "owner: milind-soni" },
    ]);
  });

  it("finds nothing in text that never mentions upstream", () => {
    expect(upstreamRefs("const answer = 42;\nexport { answer };")).toEqual([]);
  });
});
