/* =========================
   初期化
========================= */

window.addEventListener("load", () => {

  const connectButton =
    document.getElementById("calendar-connect-button");

  if (!connectButton) {
    console.error(
      "calendar-connect-buttonが見つかりません。"
    );
    return;
  }

  connectButton.addEventListener(
    "click",
    getCalendarEvents
  );

});


/* =========================
   Google Calendar取得
========================= */

async function getCalendarEvents() {

  const status =
    document.getElementById("calendar-status");

  if (status) {
    status.textContent =
      "Googleカレンダーを取得中...";
  }

  try {

    const response = await fetch(
      "/api/calendar/events"
    );

    const data =
      await response.json();


    if (!response.ok) {

      console.error(
        "Google Calendar取得エラー:",
        data
      );

      if (status) {
        status.textContent =
          "カレンダー予定を取得できませんでした。";
      }

      alert(
        data.error ||
        "Googleカレンダーを取得できませんでした。"
      );

      return;
    }


    if (status) {
      status.textContent =
        "Connected!";
    }


    await displayCalendarEvents(
      data.items ?? []
    );


  } catch (error) {

    console.error(
      "Google Calendar通信エラー:",
      error
    );

    if (status) {
      status.textContent =
        "カレンダー予定を取得できませんでした。";
    }

    alert(
      "Googleカレンダーとの通信に失敗しました。"
    );

  }

}


/* =========================
   Calendar予定表示
========================= */

async function displayCalendarEvents(events) {

  const eventContainer =
    document.getElementById("calendar-events");

  if (!eventContainer) {
    console.error(
      "calendar-eventsが見つかりません。"
    );
    return;
  }


  eventContainer.innerHTML = "";


  try {

    const response =
      await fetch("/api/lives");

    if (!response.ok) {
      throw new Error(
        "Live Listの取得に失敗しました。"
      );
    }

    const savedLives =
      await response.json();


    /* =========================
       すでに取り込んだ予定ID
    ========================= */

    const importedIds =
      new Set(
        savedLives
          .map(
            (live) =>
              live.google_event_id
          )
          .filter(
            (id) => id
          )
      );


    /* =========================
       未取り込みイベントだけ
    ========================= */

    const notImportedEvents =
      events.filter(
        (event) =>
          !importedIds.has(event.id)
      );


    if (notImportedEvents.length === 0) {

      eventContainer.innerHTML = `
        <div class="no_event">

          <h2>
            今後の予定はありません
          </h2>

        </div>
      `;

      return;
    }


    /* =========================
       イベントカード生成
    ========================= */

    notImportedEvents.forEach(
      (event) => {

        const eventElement =
          document.createElement("article");

        eventElement.classList.add(
          "calendar-event"
        );


        /*
          Flask側で以下の形に変換済み

          {
            id,
            title,
            start,
            location
          }
        */

        const title =
          event.title ??
          "タイトルなし";

        const start =
          event.start ?? "";

        const location =
          event.location ||
          "会場未登録";


        const countdown =
          getCountdown(start);


        eventElement.innerHTML = `

          <div class="minicard">

            <h2>
              ${escapeHtml(
                title.replace(
                  "ライブ",
                  ""
                )
              )}
            </h2>


            <div class="live-meta">

              <p>
                <span>
                  DATE
                </span>

                ${escapeHtml(
                  formatDate(start)
                )}
              </p>


              <p>
                <span>
                  START
                </span>

                ${escapeHtml(
                  formatTime(start)
                )}
              </p>


              <p>
                <span>
                  PLACE
                </span>

                ${escapeHtml(
                  location
                )}
              </p>

            </div>


            <button
              type="button"
              class="import-button"
            >
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
          eventElement.querySelector(
            ".import-button"
          );


        importButton.addEventListener(
          "click",
          async () => {

            const imported =
              await importLiveEvent({
                id: event.id,
                title: title,
                start: start,
                location: location
              });


            if (imported) {
              eventElement.remove();
            }

          }
        );


        eventContainer.appendChild(
          eventElement
        );

      }
    );


  } catch (error) {

    console.error(
      "Live List取得エラー:",
      error
    );

    eventContainer.innerHTML = `
      <div class="no_event">

        <h2>
          予定を取得できませんでした
        </h2>

      </div>
    `;

  }

}


/* =========================
   日付表示
========================= */

function formatDate(dateString) {

  if (!dateString) {
    return "日時未登録";
  }


  const date =
    new Date(dateString);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "日時未登録";
  }


  const month =
    date.getMonth() + 1;

  const day =
    date.getDate();

  const year =
    date.getFullYear();


  return `${month}/${day} ${year}`;
}


/* =========================
   時間表示
========================= */

function formatTime(dateString) {

  if (!dateString) {
    return "日時未登録";
  }


  /*
    終日予定の場合は

    2026-09-20

    のようなdateだけが来る
  */

  if (!dateString.includes("T")) {
    return "終日";
  }


  const date =
    new Date(dateString);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "日時未登録";
  }


  return date.toLocaleTimeString(
    "ja-JP",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}


/* =========================
   カウントダウン
========================= */

function getCountdown(liveDate) {

  if (!liveDate) {
    return "-";
  }


  const today =
    new Date();

  const target =
    new Date(liveDate);


  if (
    Number.isNaN(
      target.getTime()
    )
  ) {
    return "-";
  }


  today.setHours(
    0,
    0,
    0,
    0
  );

  target.setHours(
    0,
    0,
    0,
    0
  );


  const diff =
    target - today;


  return Math.ceil(
    diff /
    (
      1000 *
      60 *
      60 *
      24
    )
  );

}


/* =========================
   HTMLエスケープ
========================= */

function escapeHtml(value) {

  return String(value)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =========================
   Live Listへ取り込み
========================= */

async function importLiveEvent(
  liveEvent
) {

  const artist =
    liveEvent.title
      .replace(
        "ライブ",
        ""
      )
      .trim();


  const liveDate =
    liveEvent.start.slice(
      0,
      10
    );


  const startTime =
    liveEvent.start.includes("T")
      ? liveEvent.start.slice(
          11,
          16
        )
      : null;


  try {

    const response =
      await fetch(
        "/api/lives",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              google_event_id:
                liveEvent.id,

              artist:
                artist,

              date:
                liveDate,

              time:
                startTime,

              venue:
                liveEvent.location

            })

        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(
        result.message ||
        result.error ||
        "Live Listへの追加に失敗しました"
      );

    }


    alert(
      "Live Listに予定を取り込みました。"
    );


    return true;


  } catch (error) {

    console.error(
      "Live List追加エラー:",
      error
    );


    alert(
      "Live Listに予定を追加できませんでした。"
    );


    return false;

  }

}