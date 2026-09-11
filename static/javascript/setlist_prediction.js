console.log("setlist_prediction.js 読み込み成功");

const CURRENT_LIVE_ID = document.body.dataset.liveId;

console.log("live id:", CURRENT_LIVE_ID);

document.addEventListener("DOMContentLoaded", () => {
    displayLiveInfo();
    loadSavedPrediction();
});

async function displayLiveInfo() {
    const container = document.getElementById("live-info");
    const response = await fetch("/api/lives");
    const savedLives = await response.json();
    
    console.log("savedLives:", savedLives);

    const live = savedLives.find(
        (item) => String(item.id) === String(CURRENT_LIVE_ID)
    );
    if (!live) {
        container.innerHTML =`
        <p>ライブ情報が見つかりません</p>
        `;
        return;
    }
    const artistName = String(
        live.artist ?? "タイトルなし"
    )
    .trim();

    const liveStart = `${live.live_date}T${live.start_time || "00:00"}`;

    container.innerHTML = `
    <div class="live-info">
    <h1>${escapeHtml(artistName)}</h1>
    <p>DATE : ${escapeHtml(formatLiveDate(liveStart))}
    </p>
    <p>PLACE : ${escapeHtml(live.venue ?? "会場未登録")}
    </p>
    <button type="button" id="predict-setlist-button">
    AIでセトリを予想
    </button>
    </div>
    `;
    document
    .getElementById("predict-setlist-button")
    .addEventListener("click", predictSetlist);

}

function formatLiveDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return "日時未登録";
    }
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getFullYear()}`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function predictSetlist(){

    const button = document.getElementById("predict-setlist-button");
    button.disabled = true;
    button.textContent = "予想中...";

    try {
    console.log("ボタン押下");
    const response_pre = await fetch("/api/lives");
    const savedLives = await response_pre.json();
    
    const live = savedLives.find(
        (item) => String(item.id) === String(CURRENT_LIVE_ID)
    );

    const response = await fetch("/predict-setlist", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            artist: live.artist.trim(),
            date: live.start,
            venue: live.venue || ""
        })
    });

    if (!response.ok) {
        const text = await response.text();

        console.error(
            "予想APIエラー:",
            response.status,
            text
        );
        return;
    }



    const result = await response.json();

    console.log("予想結果:", result);

    const saveResponse = await fetch(
        `/api/lives/${encodeURIComponent(CURRENT_LIVE_ID)}/prediction`,
        {
            method: "POST",
    
            headers: {
                "Content-Type": "application/json"
            },
    
            body: JSON.stringify({
                songs: result
            })
        }
    );
    
    const saveResult = await saveResponse.json();
    
    if (!saveResponse.ok) {
        throw new Error(
            saveResult.message || "予想結果の保存に失敗しました"
        );
    }
    
    displayPrediction(result);

    } finally {
        button.disabled = false;
        button.textContent = "AIでセトリを予想";
    }
}

function displayPrediction(result) {
    const container = document.getElementById("prediction-area");

    container.innerHTML = `
    <div id="predicted-setlist"></div>
    `;

    const list = document.getElementById("predicted-setlist");

    result.forEach((song, index) => {
        const item = document.createElement("article");
        item.classList.add("prediction-card");
        item.innerHTML = `
        <div class="artwork-area">
        <span class="song-number">
            ${index + 1}
        </span>
        
        <img src="${song.artwork}"alt="${escapeHtml(song.title)}" class="prediction-artwork">
        </div>
        <div class="song-info">
            <h3>
                ${escapeHtml(song.title)}
            </h3>
            
            <p>${escapeHtml(song.album)}</p>
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
        console.log(song.artwork);
        list.appendChild(item);
    });

}

async function loadSavedPrediction() {

    try {

        const response = await fetch(
            `/api/lives/${encodeURIComponent(CURRENT_LIVE_ID)}/prediction`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || "予想結果の取得に失敗しました"
            );
        }

        if (result.length === 0) {
            return;
        }

        displayPrediction(result);

    } catch (error) {

        console.error(
            "保存済み予想の取得に失敗:",
            error
        );

    }
}

