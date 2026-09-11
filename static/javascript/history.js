document.addEventListener("DOMContentLoaded", () => {
    displayLiveHistory();
  
    const historyAddForm =
      document.getElementById("history-add-form");
  
    if (!historyAddForm) {
      console.error("history-add-formが見つかりません。");
      return;
    }
  
    historyAddForm.addEventListener(
      "submit",
      addHistoryLive
    );
  });
  
  async function displayLiveHistory() {
    const container = document.getElementById("history-list");

    const response = await fetch("/api/lives");

    const savedLives = await response.json();

      // ログアウト中
    if (response.status === 401) {

      container.innerHTML = `
        <div class="empty">
          <h2>
            ライブ履歴はありません
          </h2>

          <h3>
            ログインするとライブ履歴を確認できます
          </h3>
        </div>
      `;

      return;
    }
  
    const now = new Date();
  
    const pastLives = savedLives
      .filter((live) => {
        const liveDate = new Date(
          `${live.live_date}T${live.start_time || "00:00"}`
        );
  
        return !Number.isNaN(liveDate.getTime()) &&
          liveDate < now;
      })
      .sort((a, b) => {
        const dateA = new Date(
          `${a.live_date}T${a.start_time || "00:00"}`
        );
        const dateB = new Date(
          `${b.live_date}T${b.start_time || "00:00"}`
        );
        return dateB - dateA
      });
  
    container.innerHTML = "";
  
    if (pastLives.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <h2>ライブ履歴はまだありません</h2>
          <p>参加したライブがここに表示されます。</p>
        </div>
      `;
      return;
    }
  
    pastLives.forEach((live) => {
      const historyStart = `${live.live_date}T${live.start_time || "00:00"}`
      const card = document.createElement("article");
      card.classList.add("history-card");
  
      card.innerHTML = `
      <div class="history-main">
        <h2>
          ${escapeHtml(
            live.artist
          )}
        </h2>

        <div class="live-meta">
        <p class="history-date">
        <span>DATE</span>
          ${escapeHtml(formatLiveDate(historyStart))}
        </p>
  
        <p class="history-time">
        <span>START</span>
        ${escapeHtml(formatLiveTime(historyStart))}
        </p>
  
        <p class="history-location">
        <span>PLACE</span>
          ${escapeHtml(live.venue || "")}
        </p>
        </div>

        <button type="button" class="detail-button" data-id="${escapeHtml(live.id)}">
            REMINISCE
        </button>

        <button
          type="button"
          class="button playlist"
          data-id="${escapeHtml(live.id)}">
          PLAY LIST
        </button>

        </div>

        <div class="live-date-area">
        <p class="memory-label">
        LIVE MEMORY
        </p>

        <br>

        <p class="memory month">
        ${escapeHtml(formatLiveMonth(historyStart))}
        </p>

        <p class="memory year">
        ${escapeHtml(formatLiveYear(historyStart))}
        </p>

        <button type="button" class="delete-button" data-id="${escapeHtml(live.id)}">
        削除
        </button>
        </div>
      `;
  
      container.appendChild(card);
    });

    document
    .querySelectorAll(".detail-button")
    .forEach((button) => {
    button.addEventListener("click", () => {
        const id = button.dataset.id;

        window.location.href = `/history-detail/${encodeURIComponent(id)}`;
    });
    });

    document
      .querySelectorAll(".playlist")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const liveId = button.dataset.id;
          window.location.href = 
          `/playlist/${encodeURIComponent(liveId)}`;
        });
      });

    document
    .querySelectorAll(".delete-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        if(confirm("この履歴を削除しますか")) {
          deletehistory(button.dataset.id);
        }
      });
    });
  }
  
  async function deletehistory(id) {
    try {
      const response = await fetch(
        `/api/lives/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );
  
      const result = await response.json();
  
      if (!response.ok) {
        throw new Error(
          result.message || "削除に失敗しました"
        );
      }
  
      displayLiveHistory();
  
    } catch (error) {
      console.error(error);
      alert("ライブ履歴を削除できませんでした。");
    }
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

  function formatLiveMonth(dateString) {
    const date = new Date(dateString);
    return `${date.getDate()} ${date.toLocaleString("en-US", {month: "short"}).toUpperCase()}`;
  }

  function formatLiveYear(dateString) {
    const date = new Date(dateString);
    return date.getFullYear();
  }
  
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function addHistoryLive(event) {
    event.preventDefault();
  
    const artist =
      document.getElementById("history-artist").value.trim();
  
    const liveDate =
      document.getElementById("history-live-date").value;
  
    const liveTime =
      document.getElementById("history-start-time").value;
  
    const location =
      document.getElementById("history-venue").value.trim();
  
    if (!artist || !liveDate || !liveTime) {
      alert(
        "アーティスト名、ライブ日、開演時間を入力してください。"
      );
      return;
    }
  
    const startDate =
      new Date(`${liveDate}T${liveTime}:00`);
  
    if (Number.isNaN(startDate.getTime())) {
      alert("日付または時間の形式が正しくありません。");
      return;
    }
  
    if (startDate >= new Date()) {
      alert("過去のライブを入力してください。");
      return;
    }
  
    try {
      const response = await fetch("/api/lives", {
        method: "POST",
  
        headers: {
          "Content-Type": "application/json"
        },
  
        body: JSON.stringify({
          artist: artist,
          date: liveDate,
          time: liveTime,
          venue: location || "会場未登録"
        })
      });
  
      const result = await response.json();
  
      if (!response.ok) {
        throw new Error(
          result.message || "ライブ履歴の追加に失敗しました"
        );
      }
  
      event.target.reset();
  
      await displayLiveHistory();
  
      alert("ライブ履歴に追加しました。");
  
    } catch (error) {
      console.error(error);
  
      alert("ライブ履歴を追加できませんでした。");
    }
  }