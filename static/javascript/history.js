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
          <h2>ライブ履歴はまだありません</h2>
          <p>参加したライブがここに表示されます。</p>
        </div>
      `;
      return;
    }
  
    pastLives.forEach((live) => {
      const card = document.createElement("article");
      card.classList.add("history-card");
  
      card.innerHTML = `
      <div class="history-main">
        <h2>
          ${escapeHtml(
            live.title.replace("ライブ", "").trim()
          )}
        </h2>

        <div class="live-meta">
        <p class="history-date">
        <span>DATE</span>
          ${escapeHtml(formatLiveDate(live.start))}
        </p>
  
        <p class="history-time">
        <span>START</span>
        ${escapeHtml(formatLiveTime(live.start))}
        </p>
  
        <p class="history-location">
        <span>PLACE</span>
          ${escapeHtml(live.location)}
        </p>
        </div>

        <button type="button" class="detail-button" data-id="${escapeHtml(live.id)}">
            Reminisce
        </button>
        </div>

        <div class="live-date-area">
        <p class="memory-label">
        LIVE MEMORY
        </p>

        <br>

        <p class="memory month">
        ${escapeHtml(formatLiveMonth(live.start))}
        </p>

        <p class="memory year">
        ${escapeHtml(formatLiveYear(live.start))}
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
    .querySelectorAll(".delete-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        if(confirm("この履歴を削除しますか")) {
          deletehistory(button.dataset.id);
        }
      });
    });
  }
  
  function deletehistory(id) {
    const savedLives = JSON.parse(localStorage.getItem("liveList")) ?? [];

    const updatedLives = savedLives.filter(
      (live) => live.id !== id
    );
    localStorage.setItem(
      "liveList",
      JSON.stringify(updatedLives)
    );
    displayLiveHistory();
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

  function addHistoryLive(event) {
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
  
    const savedLives =
      JSON.parse(localStorage.getItem("liveList")) ?? [];
  
    savedLives.push({
      id: crypto.randomUUID(),
      title: `${artist} ライブ`,
      start: startDate.toISOString(),
      location: location || "会場未登録",
      source: "manual"
    });
  
    localStorage.setItem(
      "liveList",
      JSON.stringify(savedLives)
    );
  
    event.target.reset();
    displayLiveHistory();
  
    alert("ライブ履歴に追加しました。");
  }
