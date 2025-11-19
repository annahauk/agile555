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
let onPlayerStateChange: ((state: number) => void) | null = null;
// track whether the user has played music from the music page at least once
let playedFlag = false;

export function hasPlayed(){
  return playedFlag;
}

function markPlayedFlag(){
  playedFlag = true;
}

export function getPlayer(): YT.Player | null {
  return player || null;
}

export function setPlayerStateChangeListener(listener: (state: number) => void) {
  onPlayerStateChange = listener;
}

export async function mountMusic() {
  const recordElement = document.getElementById("record") as HTMLInputElement | null;
  const volumeSlider = document.getElementById("volume") as HTMLInputElement | null;

  if (!recordElement || !volumeSlider) {
    console.error("Music controls not found in DOM. Ensure the music template is mounted before calling mountMusic().");
    return;
  }

  // If the player is not yet created, show a loading UI and disable the record
  let loadingImg: HTMLImageElement | null = null;
  const showLoadingUI = () => {
    if (!recordElement) return
    try{ recordElement.classList.remove('spinning') }catch(e){}
    recordElement.style.display = 'none'
    recordElement.disabled = true
    recordElement.tabIndex = -1
    loadingImg = document.getElementById('record-loading') as HTMLImageElement | null
    if (!loadingImg && recordElement.parentElement) {
      loadingImg = document.createElement('img')
      loadingImg.id = 'record-loading'
      loadingImg.src = '/src/assets/loading.gif'
      loadingImg.className = 'record-loading'
      recordElement.parentElement.appendChild(loadingImg)
    } else if (loadingImg) {
      loadingImg.style.display = ''
    }
  }

  const restoreRecordUI = () => {
    if (!recordElement) return
    recordElement.style.display = ''
    // re-enable the input element when ready
    recordElement.disabled = false
    recordElement.tabIndex = 0
    if (loadingImg) loadingImg.style.display = 'none'
  }

  if (!player) {
    showLoadingUI()
  }

  await loadYouTubeAPI();

  // If player already exists, just reattach event listeners to the UI elements
  if (player) {
    // If player already exists, ensure record UI is enabled and listeners reattached
    restoreRecordUI()
    recordElement.addEventListener("click", () => {
      if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        player.pauseVideo();
        recordElement.classList.remove('spinning');
      } else {
        player.playVideo();
        recordElement.classList.add('spinning');
        markPlayedFlag();
      }
    });
    volumeSlider.addEventListener("input", (e) => {
      const volume = Number((e.target as HTMLInputElement).value);
      player.setVolume(volume);
    });
    return;
  }

  // Create or get the persistent player container
  let playerContainer = document.getElementById('persistent-player-container');
  if (!playerContainer) {
    playerContainer = document.createElement('div');
    playerContainer.id = 'persistent-player-container';
    document.body.appendChild(playerContainer);
  }

  // Create a hidden div for the YouTube player inside the persistent container
  const playerDiv = document.createElement('div');
  playerDiv.id = 'player';
  playerDiv.style.width = '0';
  playerDiv.style.height = '0';
  playerDiv.style.overflow = 'hidden';
  playerContainer.appendChild(playerDiv);

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
        player.setVolume(50);
        // Player is ready — restore the record UI and attach controls
        restoreRecordUI()
        recordElement.addEventListener("click", () => {
          if (player.getPlayerState() === YT.PlayerState.PLAYING) {
            player.pauseVideo();
            recordElement.classList.remove('spinning');
          } else {
            player.playVideo();
            recordElement.classList.add('spinning');
            markPlayedFlag();
          }
        });
        volumeSlider.addEventListener("input", (e) => {
          const volume = Number((e.target as HTMLInputElement).value);
          player.setVolume(volume);
        });
      },
      onStateChange: (event: YT.OnStateChangeEvent) => {
        if (onPlayerStateChange) {
          onPlayerStateChange(event.data);
        }
      },
    },
  });
}