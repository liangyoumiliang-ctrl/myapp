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
    <div class="live-info">
    <h2>${escapeHtml(artistName)}のプレイリストを作成します</h2>
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
        const savedPlaylistBeginner = JSON.parse(localStorage.getItem("liveList")) ?? [];
        
        const playlistBeginner = savedPlaylistBeginner.find(
            (item) => String(item.id) === String(CURRENT_LIVE_ID)
        );
        console.log("playlistBeginner:", playlistBeginner);

        const response = await fetch("/playlist-make-beginner", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                artist: playlistBeginner.title.replace("ライブ", "").trim()
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
    <div id="playlist-make-beginner"></div>
    `;
    const list = document.getElementById("playlist-make-beginner");

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

async function makePlaylistCore() {
    const button = document.getElementById("make-playlist-core");
    button.disabled = true;
    button.textContent = "作成中...";

    try {
        const savedPlaylistCore = JSON.parse(localStorage.getItem("liveList")) ?? [];
        
        const playlistCore = savedPlaylistCore.find(
            (item) => String(item.id) === String(CURRENT_LIVE_ID)
        );
        console.log("playlistCore:", playlistCore);

        const response = await fetch("/playlist-make-core", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                artist: playlistCore.title.replace("ライブ", "").trim()
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
        button.textContent = "コアファン向けプレイリスト";
    }
}

function displayPlaylist(result) {
    const container = document.getElementById("playlist-area");

    container.innerHTML = `
    <div id="playlist-make-core"></div>
    `;
    const list = document.getElementById("playlist-make-core");

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
