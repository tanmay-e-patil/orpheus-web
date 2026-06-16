# Orpheus Web

Orpheus Web manages a personal music library by pairing song records with downloadable audio sources and lyrics.

## Language

**Library Song**:
A song that has already been saved to the user's music library.
_Avoid_: Track, result, item

**Library Song ID**:
The stable identity of a Library Song inside Orpheus. It may originate from a legacy Spotify import, a Deezer match, or another provider, and should not be interpreted as provider-specific.
_Avoid_: Deezer ID, Spotify ID, track ID

**Song Metadata**:
The descriptive information for a Library Song, such as title, artist, album, artwork, release date, and duration.
_Avoid_: Tags, details

**Audio Source**:
The YouTube video selected as the source used to produce a Library Song's playable audio file. Its YouTube-specific title, channel, thumbnail, publication date, duration, and view count are Audio Source metadata, not curated Song Metadata.
_Avoid_: YouTube source, video source

**Audio Source Replacement**:
Changing a Library Song's Audio Source so the playable audio file can be regenerated from a different YouTube video.
_Avoid_: Redownload, reprocess

**Audio File Regeneration**:
Rebuilding a Library Song's playable audio file from its current metadata and Audio Source. Regeneration can be triggered without changing the Audio Source.
_Avoid_: Redownload, reprocess

**Lyrics**:
The words associated with a Library Song.
_Avoid_: Plain lyrics

**Synced Lyrics**:
Lyrics with per-line timestamps used to highlight words in time with playback.
_Avoid_: LRC, timed lyrics

**Lyrics Timing Adjustment**:
A global time offset applied to Synced Lyrics to make lyric highlighting align with playback.
_Avoid_: Line editing, retiming
