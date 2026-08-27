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

function getSavedLives() {
  return JSON.parse(
    localStorage.getItem("liveList")
  ) ?? [];
}

function getCurrentLive() {
  return getSavedLives().find(
    (live) =>
      String(live.id) === String(CURRENT_LIVE_ID)
  );
}

function displayLiveDetail() {
  const container =
    document.getElementById("live-detail");

  if (!container) {
    console.error("live-detailが見つかりません。");
    return;
  }

  const live = getCurrentLive();

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
    live.title ?? "タイトルなし"
  )
    .replace("ライブ", "")
    .trim();

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
            ${escapeHtml(formatLiveDate(live.start))}
          </span>
        </div>

        <div class="detail-item">
          <span class="detail-item-label">
            START
          </span>

          <span>
            ${escapeHtml(formatLiveTime(live.start))}
          </span>
        </div>

        <div class="detail-item">
          <span class="detail-item-label">
            PLACE
          </span>

          <span>
            ${escapeHtml(
              live.location ?? "会場未登録"
            )}
          </span>
        </div>
      </div>
    </article>
  `;
}

/* =========================
   セットリスト
========================= */

function getSetlistKey() {
  return `setlist-${CURRENT_LIVE_ID}`;
}

function getSetlist() {
  return JSON.parse(
    localStorage.getItem(getSetlistKey())
  ) ?? [];
}

function addSong(event) {
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

  const setlist = getSetlist();

  setlist.push({
    id: crypto.randomUUID(),
    title
  });

  localStorage.setItem(
    getSetlistKey(),
    JSON.stringify(setlist)
  );

  input.value = "";

  displaySetlist();
}

function displaySetlist() {
  const list =
    document.getElementById("setlist-list");

  if (!list) {
    return;
  }

  const setlist = getSetlist();

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

function deleteSong(songId) {
  const updatedSetlist = getSetlist().filter(
    (song) => song.id !== songId
  );

  localStorage.setItem(
    getSetlistKey(),
    JSON.stringify(updatedSetlist)
  );

  displaySetlist();
}

/* =========================
   メモ・感想
========================= */

function getMemoKey() {
  return `memo-${CURRENT_LIVE_ID}`;
}

function saveMemo() {
  const textarea =
    document.getElementById("live-memo");

  if (!textarea) {
    return;
  }

  localStorage.setItem(
    getMemoKey(),
    textarea.value
  );

  alert("感想を保存しました。");
}

function loadMemo() {
  const textarea =
    document.getElementById("live-memo");

  if (!textarea) {
    return;
  }

  textarea.value =
    localStorage.getItem(getMemoKey()) ?? "";
}

/* =========================
   写真
========================= */

function getPhotoKey() {
    return `photos-${CURRENT_LIVE_ID}`;
  }
  
  function getPhotos() {
    return JSON.parse(
      localStorage.getItem(getPhotoKey())
    ) ?? [];
  }
  
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

async function deletePhoto(filename) {

  const response =
    await fetch("/delete-photo", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        live_id: CURRENT_LIVE_ID,
        filename: filename
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