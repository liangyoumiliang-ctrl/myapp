window.addEventListener("load", () => {

  const addCalendarButton =
    document.getElementById("add-calendar-button");

  if (!addCalendarButton) {
    console.error(
      "add-calendar-buttonが見つかりません。"
    );
    return;
  }

  addCalendarButton.addEventListener(
    "click",
    handleAddCalendar
  );

});


async function handleAddCalendar() {

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


  try {

    const response = await fetch(
      "/api/calendar/events",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          artist: artist,
          date: liveDate,
          time: startTime,
          venue: venue
        })
      }
    );


    const result =
      await response.json();


    if (!response.ok) {

      console.error(
        "Calendar追加エラー:",
        result
      );

      alert(
        result.error ||
        "予定を追加できませんでした。"
      );

      return;
    }


    console.log(
      "Google Calendar追加成功:",
      result
    );


    alert(
      "Googleカレンダーに追加しました。"
    );


  } catch (error) {

    console.error(
      "Calendar通信エラー:",
      error
    );

    alert(
      "Googleカレンダーへの追加に失敗しました。"
    );

  }

}