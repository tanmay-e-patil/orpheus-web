import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.HTMLElement = class {};
globalThis.customElements = { define() {} };
globalThis.window = new EventTarget();
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};
const { API } = await import("../assets/js/api.js");
const { createInitialWorkflowState, loadWorkflowState, saveWorkflowState } = await import("../assets/js/store.js");
const { ReviewEditPage } = await import("../assets/js/components/review-edit.js");

function pageFixture() {
  memory.clear();
  const page = new ReviewEditPage();
  page.state = createInitialWorkflowState("Sample songs");
  page.state.trackMatches = ["a", "b"].map((id) => ({ selectedMatch: { id }, youtubeVideo: { id: `video-${id}` } }));
  page.items = ["First", "Second"].map((name) => ({ trackName: name, artistName: "Artist", albumName: "Album" }));
  page.state.editedTracks = page.items;
  page.results = [];
  page.collect = () => page.items;
  page.render = () => {};
  page.querySelector = () => null;
  page.isConnected = true;
  saveWorkflowState(page.state);
  return page;
}

test("Review saves directly, remembers partial success, and retries only the failed song", async () => {
  const page = pageFixture();
  const originalCommit = API.commit;
  const submitted = [];
  API.commit = async (items) => {
    submitted.push(items.map((item) => item.song.id));
    return { results: items.map((item) => ({ trackId: item.song.id, success: submitted.length > 1 || item.song.id === "a", error: "Try again" })) };
  };
  try {
    await page.commit();
    assert.equal(loadWorkflowState().currentStage, "review");
    assert.equal(loadWorkflowState().saveResults[0].success, true);
    assert.equal(page.allSaved(), false);
    await page.commit();
    assert.deepEqual(submitted, [["a", "b"], ["b"]]);
    assert.equal(page.allSaved(), true);
    assert.equal(loadWorkflowState(), null);
    assert.equal(page.saving, false);
  } finally { API.commit = originalCommit; }
});

test("Review prevents duplicate submissions and leaves another active draft intact", async () => {
  const page = pageFixture();
  const originalCommit = API.commit;
  let resolve;
  let calls = 0;
  API.commit = () => { calls++; return new Promise((done) => { resolve = done; }); };
  try {
    const pending = page.commit();
    await page.commit();
    assert.equal(calls, 1);
    const another = createInitialWorkflowState("Another search");
    saveWorkflowState(another);
    resolve({ results: [{ trackId: "a", success: true }, { trackId: "b", success: true }] });
    await pending;
    assert.equal(loadWorkflowState().id, another.id);
  } finally { API.commit = originalCommit; }
});

test("Review keeps edits and exposes a retry after a network failure", async () => {
  const page = pageFixture();
  const originalCommit = API.commit;
  API.commit = async () => { throw new Error("Connection lost"); };
  try {
    await page.commit();
    assert.equal(page.saveError, "Connection lost");
    assert.equal(page.saving, false);
    assert.equal(loadWorkflowState().editedTracks[0].trackName, "First");
    assert.equal(page.allSaved(), false);
  } finally { API.commit = originalCommit; }
});
