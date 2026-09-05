document.addEventListener("DOMContentLoaded", () => {
    displayNextLive();
    displayLiveHistory();
});

function displayNextLive() {
    const container = document.getElementById("live-list");

    const savedLives =
        JSON.parse(localStorage.getItem("liveList")) ?? [];
    
    const now = new Date();

    // 日付順
    const futureLives = savedLives
    .filter((live) => {
        const liveDate = new Date(live.start);
    
        return !Number.isNaN(liveDate.getTime()) &&
        liveDate >= now;
    })
    .sort((a, b) => {
        return new Date(a.start) - new Date(b.start);
    });

    container.innerHTML = "";

    if (futureLives.length === 0) {
        container.innerHTML = `
            <p>今後のライブ予定はありません。</p>
        `;
        return;
    }

    // 一番近いライブだけ取得
    const nextlive = futureLives[0];

    container.innerHTML = `
        <article class="live-card">
            <h2>${escapeHtml(nextlive.title.replace("ライブ", ""))}</h2>

            <p>${escapeHtml(formatLiveDate(nextlive.start))}</p>

            <p>開演時間 ${escapeHtml(formatLiveTime(nextlive.start))}</p>

            <p>場所 ${escapeHtml(nextlive.location)}</p>
        </article>
    `;

    const predict_container = document.getElementById("predict-setlist");

    predict_container.innerHTML = `
    <div class="button-area">
    <button type="button" class="button prediction" data-id="${escapeHtml(nextlive.id)}">
    セトリ予想
    </button>
    <button type="button" class="button playlist" data-id="${escapeHtml(nextlive.id)}">
    PLAY LIST
    </button>
    </div>
    `;
    document
    .querySelectorAll(".prediction")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const nextliveId = button.dataset.id;
            window.location.href = 
            `/setlist-prediction/${encodeURIComponent(nextliveId)}`;
        });
    });
    document
    .querySelectorAll(".playlist")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const nextliveId = button.dataset.id;
            window.location.href = `/playlist/${encodeURIComponent(nextliveId)}`;
        });
    });
}



function displayLiveHistory() {
    const container = document.getElementById("history-list");

    const savedLives =
        JSON.parse(localStorage.getItem("liveList")) ?? [];
    const now = new Date();

    const pastLives = savedLives
        .filter((live) => {
            const liveDate = new Date(live.start);

            return !Number.isNaN(liveDate.getTime()) &&
                liveDate < now;
        })
        .sort((a, b) => {
            return new Date(b.start) - new Date(a.start);
        });
    
    container.innerHTML = "";

    if (pastLives.length === 0) {
        container.innerHTML = `
        <div class="empty">
         <p>ライブ履歴はまだありません</p>
        `;
        return;
    }

    const history = pastLives[0];

    container.innerHTML = `
        <article class="history-card">
            <h2>${escapeHtml(history.title.replace("ライブ", ""))}</h2>

            <p>${escapeHtml(formatLiveDate(history.start))}</p>

            <p>開演時間 ${escapeHtml(formatLiveTime(history.start))}</p>

            <p>場所 ${escapeHtml(history.location)}</p>
        </article>
    `;

    const history_container = document.getElementById("history-playlist");

    history_container.innerHTML = `
    <div class="button-area">
    <button type="button" class="button detail" data-id="${escapeHtml(history.id)}">
    REMINISCE
    </button>
    <button type="button" class="button playlist" data-id="${escapeHtml(history.id)}">
    PLAY LIST
    </button>
    </div>
    `;
    document
    .querySelectorAll(".detail")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const historyId = button.dataset.id;
            window.location.href = 
            `/history-detail/${encodeURIComponent(historyId)}`;
        });
    });
    document
    .querySelectorAll(".playlist")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const historyId = button.dataset.id;
            window.location.href = `/playlist/${encodeURIComponent(historyId)}`;
        });
    });

}

function formatLiveDate(dateString) {
    const date = new Date(dateString);

    return `${date.getMonth() + 1}/${date.getDate()} ${date.getFullYear()}`;
}

function formatLiveTime(dateString) {
    return new Date(dateString).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit"
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