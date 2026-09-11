console.log("playlist.js 読み込み成功");
const CURRENT_LIVE_ID = document.body.dataset.liveId;
console.log("live id:", CURRENT_LIVE_ID);

document.addEventListener("DOMContentLoaded", () => {
    displayLiveInfo();
    loadSavedPlaylist();
});

async function displayLiveInfo() {
    const container = document.getElementById("live-info");
    const response = await fetch("/api/lives");
    const savedPlaylist = await response.json();
    const playlist = savedPlaylist.find(
        (item) => String(item.id) === String(CURRENT_LIVE_ID)
    );
    console.log("playlist:", playlist)
    if(!playlist) {
        container.innerHTML = `
        <p>No Information</p>
        `;
        return;
    }
    const artistName = String(
        playlist.artist ?? "タイトルなし"
    )
    .trim();

    container.innerHTML = `
    <div class="live-info">
    <h2>${escapeHtml(artistName)}のプレイリストを作成します</h2>
    <div class="playlist-switch">

    <button
        type="button"
        id="show-beginner-playlist">
        BEGINNER
    </button>

    <button
        type="button"
        id="show-core-playlist">
        CORE
    </button>
    </div>
    <button type="button" id="make-playlist-beginner">
    初心者向けプレイリスト
    </button>

    <button type="button" id="make-playlist-core">
    コアファン向けプレイリスト
    </button>
    </div>
    `;
    document
    .getElementById("make-playlist-beginner")
    .addEventListener("click", makePlaylistBeginner);

    document
    .getElementById("make-playlist-core")
    .addEventListener("click", makePlaylistCore);

    document
    .getElementById("show-beginner-playlist")
    .addEventListener("click", () => {
        showSavedPlaylist("beginner");
    });

    document
    .getElementById("show-core-playlist")
    .addEventListener("click", () => {
        showSavedPlaylist("core");
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function showSavedPlaylist(type) {

    try {

        const songs =
            await getPlaylistFromDatabase(type);

        if (songs.length === 0) {
            alert("保存済みのプレイリストはありません。");
            return;
        }

        displayPlaylist(songs);

    } catch (error) {

        console.error(
            "プレイリスト取得エラー:",
            error
        );

    }
}


// 共通関数
async function savePlaylistToDatabase(type, songs) {

    const response = await fetch(
      `/api/lives/${encodeURIComponent(CURRENT_LIVE_ID)}/playlist`,
      {
        method: "POST",
  
        headers: {
          "Content-Type": "application/json"
        },
  
        body: JSON.stringify({
          type: type,
          songs: songs
        })
      }
    );
  
    const result = await response.json();
  
    if (!response.ok) {
      throw new Error(
        result.message || "プレイリストの保存に失敗しました"
      );
    }
  
    return result;
  }

async function makePlaylistBeginner() {
    const button = document.getElementById("make-playlist-beginner");
    button.disabled = true;
    button.textContent = "作成中...";

    try {
        const response_begin = await fetch("/api/lives");
        const savedPlaylistBeginner = await response_begin.json();
        
        const playlistBeginner = savedPlaylistBeginner.find(
            (item) => String(item.id) === String(CURRENT_LIVE_ID)
        );
        if (!playlistBeginner) {
            console.error("ライブ情報が見つかりません");
            return;
        }
        console.log("playlistBeginner:", playlistBeginner);

        const response = await fetch("/playlist-make-beginner", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                artist: playlistBeginner.artist.trim()
            })
        });

        console.log("response:", response);

        if(!response.ok) {
            const text = await response.text();

            console.error(
                "プレイリストAPIエラー",
                response.status,
                text
            );
            return;
        }

        const result = await response.json();

        await savePlaylistToDatabase(
            "beginner",
            result
        );

        displayPlaylist(result);

    } finally {
        button.disabled = false;
        button.textContent = "初心者向けプレイリスト";
    }
}

async function makePlaylistCore() {
    const button = document.getElementById("make-playlist-core");
    button.disabled = true;
    button.textContent = "作成中...";

    try {
        const response_core = await fetch("/api/lives");
        const savedPlaylistCore = await response_core.json();
        
        const playlistCore = savedPlaylistCore.find(
            (item) => String(item.id) === String(CURRENT_LIVE_ID)
        );
        if (!playlistCore) {
            console.error("ライブ情報が見つかりません");
            return;
        }
        console.log("playlistCore:", playlistCore);

        const response = await fetch("/playlist-make-core", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                artist: playlistCore.artist.trim()
            })
        });

        console.log("response:", response);

        if(!response.ok) {
            const text = await response.text();

            console.error(
                "プレイリストAPIエラー",
                response.status,
                text
            );
            return;
        }

        const result = await response.json();

        await savePlaylistToDatabase(
            "core",
            result
        );

        displayPlaylist(result);

    } finally {
        button.disabled = false;
        button.textContent = "コアファン向けプレイリスト";
    }
}

function displayPlaylist(result) {
    const container = document.getElementById("playlist-area");

    container.innerHTML = `
    <div id="playlist-list"></div>
    `;
    const list = document.getElementById("playlist-list");

    result.forEach((song, index) => {
        const item = document.createElement("article");
        item.classList.add("playlist-card");
        item.innerHTML = `
        <div class="artwork-area">
        <span class="song-number">
        ${index + 1}
        </span>
        
        <img
            src="${song.artwork}"
            alt="${escapeHtml(song.title)}"
            class="playlist-artwork">
        </div>
        <div class="song-info">
            <h3>
                ${escapeHtml(song.title)}
            </h3>

            <p>
                ${escapeHtml(song.album)}
            </p>
        </div>

        <div class="song-link">
            <a href="${song.url}"
            target="_blank"
            rel="noopener noreferrer"
            >
            Apple Musicで開く
            </a>
        </div>
        `;
        list.appendChild(item);
    });
}

// Neonに保存済みのプレイリストを取得
async function getPlaylistFromDatabase(type) {

    const response = await fetch(
        `/api/lives/${encodeURIComponent(CURRENT_LIVE_ID)}/playlist/${type}`
    );

    const songs = await response.json();

    if (!response.ok) {
        throw new Error(
            songs.message || "プレイリストの取得に失敗しました"
        );
    }

    return songs;
}

// プレイリスト自動表示
async function loadSavedPlaylist() {

    try {
        const beginner =
            await getPlaylistFromDatabase("beginner");

        if (beginner.length > 0) {
            displayPlaylist(beginner);
            return;
        }

        const core =
            await getPlaylistFromDatabase("core");

        if (core.length > 0) {
            displayPlaylist(core);
        }

    } catch (error) {
        console.error(
            "保存済みプレイリストの取得に失敗:",
            error
        );
    }
}
