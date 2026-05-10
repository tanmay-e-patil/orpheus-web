import { next, setController, setDuration, setPlaybackStatus, setTime, getPlayerState } from "./player-store.js";
import { toast } from "./store.js";

let player = null;
let apiReady = false;

export function initYouTubePlayer() {
  if (window.YT?.Player) {
    apiReady = true;
    createPlayer();
  } else {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => {
      apiReady = true;
      createPlayer();
    };
  }
  pollTime();
}

function createPlayer() {
  if (player || !apiReady) return;
  const host = document.getElementById("youtube-player-host");
  if (!host) return;
  player = new YT.Player(host, {
    height: "1",
    width: "1",
    playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0 },
    events: {
      onReady: (event) => {
        setDuration(event.target.getDuration() || 0);
        const controller = {
          load: (videoId) => player?.loadVideoById(videoId),
          play: () => player?.playVideo?.(),
          pause: () => player?.pauseVideo?.(),
          stop: () => player?.stopVideo?.(),
          seekTo: (seconds) => player?.seekTo?.(seconds, true),
          getCurrentTime: () => player?.getCurrentTime?.() || 0,
          getDuration: () => player?.getDuration?.() || 0,
          setVolume: (volume) => player?.setVolume?.(Math.max(0, Math.min(100, Math.round(volume)))),
          getVolume: () => player?.getVolume?.() || 100,
          toggleMute: () => player?.isMuted?.() ? player?.unMute?.() : player?.mute?.(),
          isMuted: () => player?.isMuted?.() || false,
        };
        setController(controller);
        const now = getPlayerState().queue[getPlayerState().currentIndex];
        if (now?.youtubeVideoId && getPlayerState().status === "loading") {
          controller.load(now.youtubeVideoId);
          controller.play();
        }
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.PLAYING) setPlaybackStatus("playing");
        if (event.data === YT.PlayerState.PAUSED) setPlaybackStatus("paused");
        if (event.data === YT.PlayerState.BUFFERING) setPlaybackStatus("loading");
        if (event.data === YT.PlayerState.ENDED) next();
      },
      onError: (event) => {
        const code = event?.data;
        console.warn("YouTube playback error", { code });
        toast(`YouTube playback error${code ? ` (${code})` : ""}. Skipping...`, "error");
        next();
      },
    },
  });
}

function pollTime() {
  let last = 0;
  const step = () => {
    const now = performance.now();
    if (now - last > 250 && player) {
      last = now;
      setTime(player.getCurrentTime?.() || 0);
      setDuration(player.getDuration?.() || 0);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
