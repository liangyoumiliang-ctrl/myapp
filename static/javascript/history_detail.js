const CURRENT_LIVE_ID =
  document.body.dataset.liveId;

let currentPhotoIndex = 0;
let currentPhotos = [];
let isEditMode = false;

document.addEventListener("DOMContentLoaded", () => {
  displayLiveDetail();
  displaySetlist();
  loadMemo();
  displayPhotos();
  

  const setlistForm =
    document.getElementById("setlist-form");

  const saveMemoButton =
    document.getElementById("save-memo-button");

  const photoInput =
    document.getElementById("photo-input");

  if (setlistForm) {
    setlistForm.addEventListener("submit", addSong);
  }

  if (saveMemoButton) {
    saveMemoButton.addEventListener("click", saveMemo);
  }

  if (photoInput) {
    photoInput.addEventListener("change", addPhotos)
  }

  const photoModal =
  document.getElementById("photo-modal");

  const photoModalClose =
  document.getElementById("photo-modal-close");

  if (photoModalClose) {
    photoModalClose.addEventListener("click", closePhotoModal);
  }

    if (photoModal) {
    photoModal.addEventListener("click", (event) => {
        if (event.target === photoModal) {
        closePhotoModal();
        }
    });
    }

    document
    .getElementById("photo-prev")
    .addEventListener("click", showPrevPhoto);

    document
    .getElementById("photo-next")
    .addEventListener("click", showNextPhoto);
});

/* =========================
   ライブ情報
========================= */

async function getSavedLives() {
  const response = await fetch("/api/lives");

  if (!response.ok) {
    throw new Error("ライブ情報の取得に失敗しました。");
  }

  const savedLives = await response.json();

  return savedLives;
}


async function getCurrentLive() {
  const savedLives = await getSavedLives();

  return savedLives.find(
    (live) =>
      String(live.id) === String(CURRENT_LIVE_ID)
  );
}


async function displayLiveDetail() {

  const container =
    document.getElementById("live-detail");

  if (!container) {
    console.error("live-detailが見つかりません。");
    return;
  }


  try {

    const live = await getCurrentLive();

    if (!live) {

      container.innerHTML = `
        <div class="detail-empty">
          <h2>ライブ情報が見つかりません。</h2>
          <p>Historyページからもう一度選択してください。</p>
        </div>
      `;

      return;
    }


    const artistName = String(
      live.artist ?? "タイトルなし"
    ).trim();


    const liveStart =
      `${live.live_date}T${live.start_time || "00:00"}`;


    container.innerHTML = `
      <article class="live-detail-card">

        <p class="detail-label">
          LIVE HISTORY
        </p>

        <h1 class="detail-artist">
          ${escapeHtml(artistName)}
        </h1>


        <div class="detail-information">

          <div class="detail-item">

            <span class="detail-item-label">
              DATE
            </span>

            <span>
              ${escapeHtml(
                formatLiveDate(liveStart)
              )}
            </span>

          </div>


          <div class="detail-item">

            <span class="detail-item-label">
              START
            </span>

            <span>
              ${escapeHtml(
                formatLiveTime(liveStart)
              )}
            </span>

          </div>


          <div class="detail-item">

            <span class="detail-item-label">
              PLACE
            </span>

            <span>
              ${escapeHtml(
                live.venue || "会場未登録"
              )}
            </span>

          </div>

        </div>

      </article>
    `;

  } catch (error) {

    console.error(
      "ライブ情報取得エラー:",
      error
    );

    container.innerHTML = `
      <div class="detail-empty">
        <h2>ライブ情報の取得に失敗しました。</h2>
      </div>
    `;

  }
}

/* =========================
   セットリスト
========================= */

async function addSong(event) {
  event.preventDefault();

  const input =
    document.getElementById("song-title");

  if (!input) {
    return;
  }

  const title = input.value.trim();

  if (!title) {
    return;
  }

  try {

    const response = await fetch(
      `/api/lives/${encodeURIComponent(CURRENT_LIVE_ID)}/setlist`,
      {
        method: "POST",
  
        headers: {
          "Content-Type": "application/json"
        },
  
        body: JSON.stringify({
          title: title
        })
      }
    );
  
    const result = await response.json();
  
    if (!response.ok) {
      throw new Error(
        result.message || "曲の追加に失敗しました"
      );
    }
  
    input.value = "";
  
    await displaySetlist();
  
  } catch (error) {
  
    console.error(error);
  
    alert("曲を追加できませんでした。");
  }
}

async function displaySetlist() {
  const list =
    document.getElementById("setlist-list");

  if (!list) {
    return;
  }

  const response = await fetch(
    `/api/lives/${encodeURIComponent(CURRENT_LIVE_ID)}/setlist`
  );
  
  const setlist = await response.json();
  
  if (!response.ok) {
    console.error(setlist);
    return;
  }

  list.innerHTML = "";

  if (setlist.length === 0) {
    list.innerHTML = `
      <p class="setlist-empty">
        セットリストはまだ登録されていません。
      </p>
    `;
    return;
  }

  setlist.forEach((song) => {
    const item = document.createElement("li");
    item.textContent = song;

    item.classList.add("setlist-item");

    item.innerHTML = `
      <span class="song-title">
        ${escapeHtml(song.title)}
      </span>
      ${
        isEditMode
        ?
        `
          <button
          type="button"
          class="delete-song-button"
          data-id="${escapeHtml(song.id)}">
        </button>
        `
        : ""
      }
    `;

    list.appendChild(item);
  });

  document
    .querySelectorAll(".delete-song-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const confirmed = confirm(
          "この曲をセットリストから削除しますか？"
        );

        if (confirmed) {
          deleteSong(button.dataset.id);
        }
      });
    });

  document
    .getElementById("edit-button")
    .addEventListener("click", toggleEditMode)
}

function toggleEditMode() {
  isEditMode = !isEditMode

  displaySetlist();

  const button = document.getElementById("edit-button")
  button.textContent = isEditMode ? "完了" : "編集";
}

async function deleteSong(songId) {

  try {

    const response = await fetch(
      `/api/lives/${encodeURIComponent(CURRENT_LIVE_ID)}/setlist/${encodeURIComponent(songId)}`,
      {
        method: "DELETE"
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message || "曲の削除に失敗しました"
      );
    }

    await displaySetlist();

  } catch (error) {

    console.error(error);

    alert("曲を削除できませんでした。");

  }
}

/* =========================
   メモ・感想
========================= */
async function saveMemo() {
  const textarea =
    document.getElementById("live-memo");

  if (!textarea) {
    return;
  }

  try {
    const response = await fetch(
      `/api/lives/${encodeURIComponent(CURRENT_LIVE_ID)}/memo`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          memo: textarea.value
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message || "メモの保存に失敗しました"
      );
    }

    alert("感想を保存しました。");

  } catch (error) {
    console.error(error);
    alert("感想を保存できませんでした。");
  }
}

async function loadMemo() {
  const textarea =
    document.getElementById("live-memo");

  if (!textarea) {
    return;
  }

  try {
    const response = await fetch(
      `/api/lives/${encodeURIComponent(CURRENT_LIVE_ID)}/memo`
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message || "メモの取得に失敗しました"
      );
    }

    textarea.value = result.memo || "";

  } catch (error) {
    console.error(error);
    textarea.value = "";
  }
}

/* =========================
   写真
========================= */
async function addPhotos(event) {
  const files = Array.from(event.target.files);

  if (files.length === 0) {
    return;
  }

  for (const file of files){
    const formData = new FormData();

    formData.append("photo", file);
    formData.append("live_id", CURRENT_LIVE_ID);

    const response =
      await fetch("/upload-photo", {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        alert(
          data.message ?? `${file.name} の保存に失敗しました。`
        );
      }
  }

    await displayPhotos();

    event.target.value = "";
}

async function displayPhotos() {
  const gallery =
      document.getElementById("photo-gallery");

  if (!gallery) return;

  const response =
      await fetch(`/photos/${CURRENT_LIVE_ID}`);

  if (!response.ok) {
      console.error("写真一覧を取得できません");
      return;
  }

  currentPhotos = await response.json();

  gallery.innerHTML = "";

  if (currentPhotos.length === 0) {
      gallery.innerHTML = `
          <p class="photo-empty">
              写真はまだ登録されていません。
          </p>
      `;
      return;
  }

  currentPhotos.forEach((photo, index) => {

      const item =
          document.createElement("div");

      item.classList.add("photo-item");

      item.innerHTML = `
          <img
              src="${photo.src}"
              class="live-photo"
              alt="ライブ写真"
          >

          <button
            type="button"
            class="delete-photo-button"
            data-id="${photo.id}">
            削除
            </button>
      `;

      item.querySelector(".live-photo")
          .addEventListener("click", () => {
              openPhotoModal(index);
          });

      gallery.appendChild(item);
  });

  document
    .querySelectorAll(".delete-photo-button")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const confirmed =
        confirm("この写真を削除しますか？");
        if (!confirmed) {
          return;
        }
        await deletePhoto(button.dataset.id);
      });
  });
}

async function deletePhoto(photoId) {

  const response =
    await fetch("/delete-photo", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        live_id: CURRENT_LIVE_ID,
        filename: photoId
      })
    });

  const data = await response.json();

  if (!response.ok || !data.success) {
    alert(
      data.message ?? "写真を削除できませんでした。"
    );
    return;
  }

  await displayPhotos();
}

/* =========================
   表示用関数
========================= */

function formatLiveDate(dateString) {
  if (!dateString) {
    return "日時未登録";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "日時未登録";
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  return `${month}/${day} ${year}`;
}

function formatLiveTime(dateString) {
  if (!dateString) {
    return "日時未登録";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "日時未登録";
  }

  return date.toLocaleTimeString("ja-JP", {
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

function openPhotoModal(index) {

    currentPhotoIndex = index;

    const modal =
        document.getElementById("photo-modal");

    const image =
        document.getElementById("photo-modal-image");

    image.src =
        currentPhotos[currentPhotoIndex].src;

    updatePhotoCounter();

    modal.classList.add("show");

    document.body.style.overflow = "hidden";
}
function showPrevPhoto() {

    currentPhotoIndex--;

    if(currentPhotoIndex < 0){
        currentPhotoIndex =
            currentPhotos.length - 1;
    }

    document.getElementById(
        "photo-modal-image"
    ).src =
        currentPhotos[currentPhotoIndex].src;

    updatePhotoCounter();
}
function showNextPhoto() {

    currentPhotoIndex++;

    if(currentPhotoIndex >= currentPhotos.length){
        currentPhotoIndex = 0;
    }

    document.getElementById(
        "photo-modal-image"
    ).src =
        currentPhotos[currentPhotoIndex].src;

    updatePhotoCounter();
}
function updatePhotoCounter(){

    document.getElementById(
        "photo-counter"
    ).textContent =
        `${currentPhotoIndex + 1} / ${currentPhotos.length}`;

}
function closePhotoModal() {
    const modal =
      document.getElementById("photo-modal");
  
    const modalImage =
      document.getElementById("photo-modal-image");
  
    modal.classList.remove("show");
  
    modalImage.src = "";
  
    document.body.style.overflow = "";
  }
document
.getElementById("photo-prev")
.addEventListener("click", showPrevPhoto);

document
.getElementById("photo-next")
.addEventListener("click", showNextPhoto);