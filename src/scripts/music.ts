/// <reference types="youtube" />

export function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already loaded
    if ((window as any).YT && (window as any).YT.Player) {
      resolve();
      return;
    }

    // Loading
    const existingScript = document.getElementById("youtube-iframe-api");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", () =>
        reject(new Error("Failed to load YouTube IFrame API"))
      );
      return;
    }

    // Create script
    const tag = document.createElement("script");
    tag.id = "youtube-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;

    tag.onload = () => {
      (window as any).onYouTubeIframeAPIReady = () => {
        resolve();
      };
    };

    tag.onerror = () => reject(new Error("Failed to load YouTube IFrame API"));
    document.body.appendChild(tag);
  });
}

let player: YT.Player;

export async function mountMusic() {
  const startBtn = document.getElementById("start") as HTMLButtonElement | null;
  const pauseBtn = document.getElementById("pause") as HTMLButtonElement | null;
  const recordElement = document.getElementById("record") as HTMLElement | null;

  if (!startBtn || !pauseBtn) {
    console.error("Music controls not found in DOM. Ensure the music template is mounted before calling mountMusic().");
    return;
  }

  await loadYouTubeAPI();

  player = new YT.Player("player", {
    height: "0",
    width: "0",
    videoId: "jfKfPfyJRdk", // Lofi livestream
    playerVars: {
      autoplay: 0,
      controls: 0,
      modestbranding: 1,
      rel: 0,
    },
    events: {
      onReady: () => {
        startBtn.addEventListener("click", () => {
          player.playVideo();
          if (recordElement) recordElement.classList.add('spinning');
        });
        pauseBtn.addEventListener("click", () => {
          player.pauseVideo();
          if (recordElement) recordElement.classList.remove('spinning');
        });
      },
    },
  });
}