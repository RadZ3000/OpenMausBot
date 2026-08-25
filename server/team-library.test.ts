import { describe, expect, it, vi } from "vitest";

import {
  fetchGithubTeam,
  fetchLibraryTeam,
  fetchTeamCatalog,
  githubManifestUrls,
  parseTeamCatalog,
  teamLibraryEnabled,
} from "./team-library.ts";

const manifest = {
  format: "openmaus.team",
  version: 2,
  team: {
    name: "Engineering",
    members: [
      {
        key: "lead",
        name: "Ada",
        title: "Tech Lead",
        description: "Coordinates the work",
        appearance: { color: "purple" },
      },
    ],
  },
};

const catalog = {
  format: "openmaus.catalog",
  version: 1,
  teams: [
    {
      slug: "engineering",
      name: "Engineering Team",
      summary: "Plan and ship software.",
      category: "Engineering",
      manifest: "teams/engineering/team.mausteam.json",
      readme: "teams/engineering/README.md",
      members: 1,
      skills: ["teams/engineering/skills/release/SKILL.md"],
      requires: { apps: ["GitHub"] },
    },
  ],
};

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("team library", () => {
  const libraryEnv = { OMB_TEAM_LIBRARY: "https://github.com/acme/teams" };
  const catalogUrl = "https://raw.githubusercontent.com/acme/teams/main/catalog.json";
  const manifestUrl = "https://raw.githubusercontent.com/acme/teams/main/teams/engineering/team.mausteam.json";

  it("is off unless a repository is configured", () => {
    expect(teamLibraryEnabled({ OMB_TEAM_LIBRARY: "off" })).toBe(false);
    expect(teamLibraryEnabled({})).toBe(false);
    expect(teamLibraryEnabled(libraryEnv)).toBe(true);
  });

  it("validates catalog paths and records the configured repository URL", () => {
    const parsed = parseTeamCatalog(catalog, libraryEnv.OMB_TEAM_LIBRARY);
    expect(parsed.repositoryUrl).toBe("https://github.com/acme/teams");
    expect(parsed.teams[0]).toMatchObject({ slug: "engineering", members: 1 });

    const unsafe = structuredClone(catalog);
    unsafe.teams[0]!.manifest = "../private.json";
    expect(() => parseTeamCatalog(unsafe, libraryEnv.OMB_TEAM_LIBRARY)).toThrow("safe catalog path");
  });

  it("does not fetch a catalog when the library is off", async () => {
    const fetcher = vi.fn(async () => response({})) as unknown as typeof fetch;
    await expect(fetchTeamCatalog(fetcher, { OMB_TEAM_LIBRARY: "off" })).rejects.toThrow(
      "Team library is off in this build",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads only the manifest selected by the trusted catalog", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target === catalogUrl) return response(catalog);
      if (target === manifestUrl) return response(manifest);
      return response({}, 404);
    }) as unknown as typeof fetch;

    const loaded = await fetchLibraryTeam("engineering", fetcher, libraryEnv);
    if (loaded.format !== "openmaus.team") throw new Error("expected a legacy team");
    expect(loaded.team.name).toBe("Engineering");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("normalizes public GitHub repository, blob, and raw links", () => {
    expect(githubManifestUrls("https://github.com/acme/team")).toEqual([
      "https://raw.githubusercontent.com/acme/team/main/botmrr.md",
      "https://raw.githubusercontent.com/acme/team/main/team.md",
      "https://raw.githubusercontent.com/acme/team/main/team.mausteam.json",
      "https://raw.githubusercontent.com/acme/team/master/botmrr.md",
      "https://raw.githubusercontent.com/acme/team/master/team.md",
      "https://raw.githubusercontent.com/acme/team/master/team.mausteam.json",
    ]);
    expect(githubManifestUrls("https://github.com/acme/team/blob/main/presets/seo.mausteam.json")).toEqual([
      "https://raw.githubusercontent.com/acme/team/main/presets/seo.mausteam.json",
    ]);
    expect(githubManifestUrls("https://raw.githubusercontent.com/acme/team/main/team.mausteam.json")).toEqual([
      "https://raw.githubusercontent.com/acme/team/main/team.mausteam.json",
    ]);
    expect(() => githubManifestUrls("http://example.com/team.json")).toThrow("public HTTPS GitHub");
    expect(() => githubManifestUrls("https://github.com/acme/team/blob/main/run.sh")).toThrow("Markdown playbook");
  });

  it("falls back from main to master for a repository link", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("team.mausteam.json") && String(url).includes("/master/")
        ? response(manifest)
        : response({}, 404),
    ) as unknown as typeof fetch;

    const loaded = await fetchGithubTeam("https://github.com/acme/team", fetcher);
    if (loaded.format !== "openmaus.team") throw new Error("expected a legacy team");
    expect(loaded.team.members[0]?.name).toBe("Ada");
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
});
