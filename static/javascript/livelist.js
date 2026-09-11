document.addEventListener("DOMContentLoaded", () => {
    displayLiveList();
  });
  
  async function displayLiveList() {
    const container =
      document.getElementById("live-list");

    const days = document.getElementById("countdown");

    const response = await fetch("/api/lives");

    const savedLives = await response.json();

    // ログアウト中
  if (response.status === 401) {

    container.innerHTML = `
      <div class="empty">
        <h2>
          今後のライブ予定はありません
        </h2>

        <h3>
          ログインするとライブ予定を確認・追加できます
        </h3>
      </div>
    `;

    return;
  }

    const now = new Date();

    const futureLives = savedLives
    .filter((live) => {
        const liveDate = new Date(
          `${live.live_date}T${live.start_time || "00:00"}`
        );
    
        return !Number.isNaN(liveDate.getTime()) &&
        liveDate >= now;
    })
    .sort((a, b) => {
      const dateA = new Date(
        `${a.live_date}T${a.start_time || "00:00"}`
      );
      const dateB = new Date(
        `${b.live_date}T${b.start_time || "00:00"}`
      );
      return dateA - dateB
    });

    container.innerHTML = "";
  
    if (futureLives.length === 0) {
      container.innerHTML = `
        <div class="empty">
        <h2>
            今後のライブ予定はありません
        </h2>
        <h3>
        「Add Live」からライブ予定を追加しましょう！
        </h3>
        </div>
        `;
      return;
    }

    futureLives.forEach((live) => {
        const liveStart = `${live.live_date}T${live.start_time || "00:00"}`;
        const countdown = getCountdown(liveStart);
        const card = document.createElement("article");
        card.classList.add("live-card");
  
        card.innerHTML = `
    <div class="live-main">

        <h2>
            ${escapeHtml(live.artist)}
        </h2>

        <div class="live-meta">
            <p>
                <span>DATE</span>
                ${escapeHtml(formatLiveDate(liveStart))}
            </p>

            <p>
                <span>START</span>
                ${escapeHtml(formatLiveTime(liveStart))}
            </p>

            <p>
                <span>PLACE</span>
                ${escapeHtml(live.venue || "")}
            </p>
        </div>

        <button
            type="button"
            class="button prediction"
            data-id="${escapeHtml(live.id)}">
            セトリ予想
        </button>

        <button
          type="button"
          class="button playlist"
          data-id="${escapeHtml(live.id)}">
          PLAY LIST
        </button>
    </div>

    <div class="live-countdown-area">
        <p class="countdown-label">
            LIVEまで
        </p>

        <p class="countdown-number">
            ${countdown}
        </p>

        <p class="countdown-unit">
            DAYS
        </p>

        <button
            type="button"
            class="delete-live-button"
            data-id="${escapeHtml(live.id)}">
            削除
        </button>
    </div>
`;
  
        container.appendChild(card);
      });
  
    document
      .querySelectorAll(".delete-live-button")
      .forEach((button) => {
        button.addEventListener("click", () => {
            if(confirm("このライブを削除しますか")) {
                deleteLive(button.dataset.id);
            }
        });
      });

    document
    .querySelectorAll(".prediction")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const liveId = button.dataset.id;
  
        window.location.href =
          `/setlist-prediction/${encodeURIComponent(liveId)}`;
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
  }
  
  async function deleteLive(id) {
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
      displayLiveList();
    } catch (error) {
      console.error(error);
      alert("ライブを削除できませんでした")
    }
  }

  function getCountdown(liveDate) {
    const today = new Date();
    const target = new Date(liveDate);

    // 時刻の影響をなくす
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const diff = target - today;

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
  
  function formatLiveDate(dateString) {
    if (!dateString) {
      return "日時未登録";
    }

    const date = new Date(dateString);

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();

    return `${month}/${day} ${year}`;
}

  function formatLiveTime(dateString) {
    if (!dateString) {
        return "日時未登録";
    }

    return new Date(dateString).toLocaleString("ja-JP", {
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

  