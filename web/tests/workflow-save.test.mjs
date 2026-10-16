import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCommitItems, mergeCommitResults } from "../assets/js/workflow-save.js";

const state = {
  trackMatches: [
    { selectedMatch: { id: "a" }, youtubeVideo: { id: "video-a" } },
    { selectedMatch: null, youtubeVideo: { id: "ignored" } },
    { selectedMatch: { id: "b" }, youtubeVideo: { id: "video-b" } },
  ],
  editedTracks: [{ trackName: "First song" }, { trackName: "Second song" }],
  lyricsSearchResults: [{ trackId: "b", selectedOption: { plainLyrics: "Words" } }],
};

test("retry submits only unsaved songs and retains the correct edits and lyrics", () => {
  const items = buildCommitItems(state, [{ trackId: "a", success: true }, { trackId: "b", success: false }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].song.id, "b");
  assert.equal(items[0].video.id, "video-b");
  assert.equal(items[0].edits.trackName, "Second song");
  assert.equal(items[0].lyricsSearchResult.selectedOption.plainLyrics, "Words");
});

test("partial save keeps successful results when a retry completes", () => {
  const previous = [{ trackId: "a", success: true }, { trackId: "b", success: false }];
  const pending = buildCommitItems(state, previous);
  const results = mergeCommitResults(previous, pending, [{ trackId: "b", success: true }]);
  assert.deepEqual(results, [{ trackId: "a", success: true }, { trackId: "b", success: true }]);
  assert.deepEqual(buildCommitItems(state, results), []);
});

test("missing confirmations remain retryable rather than counting as saved", () => {
  const submitted = buildCommitItems(state);
  const results = mergeCommitResults([], submitted, [{ trackId: "a", success: true }]);
  assert.equal(results[1].success, false);
  assert.match(results[1].error, /No save confirmation/);
  assert.deepEqual(buildCommitItems(state, results).map((item) => item.song.id), ["b"]);
});
