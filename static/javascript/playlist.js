console.log("playlist.js 読み込み成功");
const CURRENT_LIVE_ID = document.body.dataset.liveId;
console.log("live id:", CURRENT_LIVE_ID);

document.addEventListener("DOMContentLoaded", () => {
    displayLiveInfo();
    loadSavedPlaylist();
});

function displayLiveInfo() {
    const container = document.getElementById("live-info");
    const savedPlaylist = JSON.parse(localStorage.getItem("liveList")) ?? [];
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
        playlist.title ?? "タイトルなし"
    )
    .replace("ライブ", "")
    .trim();

    container.innerHTML = `
    <h2>${escapeHtml(artistName)}のプレイリストを作成します</h2>
    <button type="button" id="make-playlist-beginner">
    初心者向けプレイリスト
    </button>
    `;
    document
    .getElementById("make-playlist-beginner")
    .addEventListener("click", makePlaylistBeginner);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function makePlaylistBeginner() {
    const button = document.getElementById("make-playlist-beginner");
    button.disabled = true;
    button.textContent = "作成中...";

    try {
        const savedPlaylist = JSON.parse(localStorage.getItem("liveList")) ?? [];
        
        const playlist = savedPlaylist.find(
            (item) => String(item.id) === String(CURRENT_LIVE_ID)
        );
        console.log("playlist:", playlist);

        const response = await fetch("/playlist-make", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                artist: playlist.title.replace("ライブ", "").trim()
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

        localStorage.setItem(
            getPlaylistKey(),
            JSON.stringify(result)
        );

        displayPlaylist(result);

    } finally {
        button.disabled = false;
        button.textContent = "初心者向けプレイリスト";
    }
}

function displayPlaylist(result) {
    const container = document.getElementById("playlist-area");

    container.innerHTML = `
    <div id="playlist-make"></div>
    `;
    const list = document.getElementById("playlist-make");

    result.forEach((song, index) => {
        const item = document.createElement("article");
        item.classList.add("playlist-card");
        item.innerHTML = `
        <div class="artwork-area">
        <span class="song-number">
        ${index + 1}
        </span>
        
        <img
        src="${song.artwork}"alt="${escapeHtml(song.title)}"
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
            <a href="${song.url}
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

function getPlaylistKey() {
    return `playlist-${CURRENT_LIVE_ID}`;
}

function loadSavedPlaylist() {
    const savedPlaylist = localStorage.getItem(getPlaylistKey());

    if (!savedPlaylist) {
        return;
    }

    const result = JSON.parse(savedPlaylist);
    displayPlaylist(result);
}
