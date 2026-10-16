import assert from "node:assert/strict";
import { test } from "node:test";

// The component methods under test do not render or require a browser DOM.
globalThis.HTMLElement = class {};
globalThis.customElements = { define() {} };
const { DeezerMatchingPage } = await import("../assets/js/components/deezer-matching.js");

test("Discover query reaches the matching API without discovery-only video fields", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (path, options) => {
    request = { path, body: JSON.parse(options.body) };
    return new Response("[]", { headers: { "Content-Type": "application/json" } });
  };
  try {
    const page = new DeezerMatchingPage();
    page.state = { searchQuery: "Atif Aslam Dil Diyan Gallan" };
    page.selectedVideos = [{ id: "video", title: "Lyrical | Dil Diyan Gallan", selected: true }];
    page.render = () => {};
    page.persist = () => {};
    await page.findMatches();
    assert.equal(request.path, "/api/discover/deezer/matches");
    assert.equal(request.body.searchQuery, page.state.searchQuery);
    assert.deepEqual(request.body.videos, [{ id: "video", title: "Lyrical | Dil Diyan Gallan" }]);
    assert.deepEqual(page.results, []);
    assert.equal(page.loading, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("matching cache rejects legacy drafts and changed queries", () => {
  const page = new DeezerMatchingPage();
  page.state = { searchQuery: "Dil Diyan Gallan" };
  page.selectedVideos = [{ id: "video" }];
  page.results = [{ youtubeVideo: { id: "video" } }];
  assert.equal(page.matchesCurrentSelection(), false);
  page.state.trackMatchSearchQuery = "Other song";
  assert.equal(page.matchesCurrentSelection(), false);
  page.state.trackMatchSearchQuery = page.state.searchQuery;
  assert.equal(page.matchesCurrentSelection(), true);
  page.selectedVideos = [{ id: "another-video" }];
  assert.equal(page.matchesCurrentSelection(), false);
});
