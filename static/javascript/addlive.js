const WRITE_CLIENT_ID =
  "824079320692-6ou0alr3ic66bpoc8ak4ncim3jk8frej.apps.googleusercontent.com";

const WRITE_CALENDAR_ID =
  "23a97f8ed0955fe8fc2d96bfdba25867865d515c646ef1bfb01b5d2c68f65c48@group.calendar.google.com";

let writeTokenClient = null;

window.addEventListener("load", () => {
  const addCalendarButton =
    document.getElementById("add-calendar-button");

  if (!addCalendarButton) {
    console.error("add-calendar-buttonが見つかりません。");
    return;
  }

  if (
    typeof google === "undefined" ||
    !google.accounts?.oauth2
  ) {
    console.error("Google認証ライブラリを読み込めていません。");
    return;
  }

  writeTokenClient =
    google.accounts.oauth2.initTokenClient({
      client_id: WRITE_CLIENT_ID,
      scope:
        "https://www.googleapis.com/auth/calendar.events",
      callback: () => {}
    });

  addCalendarButton.addEventListener(
    "click",
    handleAddCalendar
  );
});

function handleAddCalendar() {
  if (!writeTokenClient) {
    alert("Google認証の準備が完了していません。");
    return;
  }

  const artist =
    document.getElementById("artist").value.trim();

  const liveDate =
    document.getElementById("live-date").value.trim();

  const startTime =
    document.getElementById("start-time").value.trim();

  const venue =
    document.getElementById("venue").value.trim();

  if (!artist || !liveDate || !startTime) {
    alert(
      "アーティスト名、日付、開演時間を入力してください。"
    );
    return;
  }

  const dateTimeString =
    `${liveDate}T${startTime}:00`;

  const startDate = new Date(dateTimeString);

  if (Number.isNaN(startDate.getTime())) {
    console.error("不正な日時です。", {
      liveDate,
      startTime,
      dateTimeString
    });

    alert("日付または時間の形式が正しくありません。");
    return;
  }

  const endDate = new Date(
    startDate.getTime() + 3 * 60 * 60 * 1000
  );

  writeTokenClient.callback =
    async (tokenResponse) => {
      if (tokenResponse.error) {
        console.error(
          "Google認証エラー:",
          tokenResponse
        );

        alert("Google認証に失敗しました。");
        return;
      }

      await addLiveToCalendar(
        tokenResponse.access_token,
        artist,
        startDate,
        endDate,
        venue
      );
    };

  writeTokenClient.requestAccessToken({
    prompt: "consent"
  });
}

async function addLiveToCalendar(
  accessToken,
  artist,
  startDate,
  endDate,
  venue
) {
  const eventData = {
    summary: `${artist} ライブ`,
    location: venue,
    description: "ライブ準備アプリから追加",
    start: {
      dateTime: startDate.toISOString(),
      timeZone: "Asia/Tokyo"
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: "Asia/Tokyo"
    }
  };

  const url =
    "https://www.googleapis.com/calendar/v3/calendars/" +
    `${encodeURIComponent(WRITE_CALENDAR_ID)}/events`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(eventData)
    });

    if (!response.ok) {
      const errorData = await response.json();

      console.error(
        "Google Calendar APIエラー:",
        errorData
      );

      throw new Error(
        `予定の追加に失敗しました: ${response.status}`
      );
    }

    const createdEvent = await response.json();

    console.log("追加した予定:", createdEvent);

    alert(
      "ライブ専用カレンダーに追加しました。"
    );
  } catch (error) {
    console.error(error);
    alert("予定を追加できませんでした。");
  }
}