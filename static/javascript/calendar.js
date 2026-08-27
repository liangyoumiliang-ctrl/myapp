const CLIENT_ID = "824079320692-6ou0alr3ic66bpoc8ak4ncim3jk8frej.apps.googleusercontent.com";

const LIVE_CALENDAR_ID = "23a97f8ed0955fe8fc2d96bfdba25867865d515c646ef1bfb01b5d2c68f65c48@group.calendar.google.com";

const SCOPES =
  "https://www.googleapis.com/auth/calendar.events";

let readtokenClient;

window.onload = () => {
  readtokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,

    callback: async (tokenResponse) => {
      if (tokenResponse.error) {
        console.error(tokenResponse);
        return;
      }

      document.getElementById("calendar-status").textContent =
        "Connected!";

      await getCalendarEvents(tokenResponse.access_token);
    }
  });

  const connectButton =
    document.getElementById("calendar-connect-button");

  connectButton.addEventListener("click", () => {
   readtokenClient.requestAccessToken({
      prompt: ""
    });
  });
};

async function getCalendarEvents(accessToken) {
  const now = new Date().toISOString();

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(LIVE_CALENDAR_ID)}/events` +
    `?timeMin=${encodeURIComponent(now)}` +
    "&singleEvents=true" +
    "&orderBy=startTime" +
    "&maxResults=10";

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`予定の取得に失敗しました: ${response.status}`);
    }

    const data = await response.json();

    displayCalendarEvents(data.items ?? []);
  } catch (error) {
    console.error(error);

    document.getElementById("calendar-status").textContent =
      "カレンダー予定を取得できませんでした。";
  }
}

function displayCalendarEvents(events) {
  const eventContainer =
    document.getElementById("calendar-events");

  eventContainer.innerHTML = "";

  const savedLives =
  JSON.parse(localStorage.getItem("liveList")) ?? [];

    const importedIds = new Set(
    savedLives.map((live) => live.id)
    );

    const notImportedEvents = events.filter(
    (event) => !importedIds.has(event.id)
    );

  if (notImportedEvents.length === 0) {
    eventContainer.innerHTML = `
    <div class="no_event">
    <h2>今後の予定はありません</h2>
    </div>
    `;
    return;
  }

  notImportedEvents.forEach((event) => {
    const eventElement = document.createElement("article");
    eventElement.classList.add("calendar-event");

    console.log("events:", events)
  
    const title = event.summary ?? "タイトルなし";
    const start =
      event.start?.dateTime ?? event.start?.date ?? "";
    const location = event.location ?? "会場未登録";

    const countdown = getCountdown(start);
  
    eventElement.innerHTML = `
      <div class="minicard">
        <h2>
        ${escapeHtml(title.replace("ライブ",""))}
        </h2>
        <div class="live-meta">
          <p>
          <span>DATE</span>
          ${escapeHtml(formatDate(start))}
          </p>
          <p>
          <span>START</span>
          ${escapeHtml(formatTime(start))}
          </p>
          <p>
          <span>PLACE</span>
          ${escapeHtml(location)}
          </p>
        </div>
    
        <button type="button" class="import-button">
          Add to List
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
      </div>
    `;
  
    const importButton =
    eventElement.querySelector(".import-button");
  
    importButton.addEventListener("click", () => {
        const imported = importLiveEvent({
            id: event.id,
            title: title,
            start: start,
            location: location
        });
    
        if (imported) {
            eventElement.remove();
        }
    });
  
    eventContainer.appendChild(eventElement);
  });
}

function formatDate(dateString) {
    if (!dateString) {
      return "日時未登録";
    }

    const date = new Date(dateString);

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();

    return `${month}/${day} ${year}`;
}

  function formatTime(dateString) {
    if (!dateString) {
        return "日時未登録";
    }

    return new Date(dateString).toLocaleString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit"
    });
  }

  function getCountdown(liveDate) {
    const today = new Date();
    const target = new Date(liveDate);

    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const diff = target - today;

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function importLiveEvent(liveEvent) {
    const savedLives =
      JSON.parse(localStorage.getItem("liveList")) ?? [];
  
    const alreadyImported = savedLives.some(
      (live) => live.id === liveEvent.id
    );
  
    savedLives.push(liveEvent);
  
    localStorage.setItem(
      "liveList",
      JSON.stringify(savedLives)
    );
  
    alert("Live Listに予定を取り込みました。");
    return true;
  }