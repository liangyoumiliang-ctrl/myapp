from flask import Flask, render_template, request, jsonify
import os
from werkzeug.utils import secure_filename
import requests
from collections import Counter
from google import genai
import json
import time
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GCP_API_KEY")

SETLIST_FM_API_KEY = os.getenv("SETLIST_API_KEY")

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/addlive")
def addlive():
    return render_template("addlive.html")


@app.route("/livelist")
def livelist():
    return render_template("livelist.html")


@app.route("/history")
def history():
    return render_template("history.html")


@app.route("/history-detail/<live_id>")
def history_detail(live_id):
    return render_template("history_detail.html", live_id=live_id)


@app.route("/upload-photo", methods=["POST"])
def upload_photo():
    photo = request.files.get("photo")
    live_id = request.form.get("live_id")
    if photo is None:
        return jsonify({"success": False, "message": "写真がありません"}), 400

    if not live_id:
        return jsonify({"success": False, "message": "ライブIDがありません"}), 400

    upload_folder = os.path.join(app.static_folder, "uploads", live_id)
    os.makedirs(upload_folder, exist_ok=True)
    filename = secure_filename(photo.filename)
    save_path = os.path.join(upload_folder, filename)

    photo.save(save_path)

    photo_url = f"/static/uploads/{live_id}/{filename}"
    return jsonify({"success": True, "url": photo_url})


@app.route("/photos/<live_id>")
def get_photo(live_id):
    upload_folder = os.path.join(app.static_folder, "uploads", live_id)

    if not os.path.exists(upload_folder):
        return jsonify([])

    files = os.listdir(upload_folder)

    photo_urls = []

    for filename in files:
        photo_urls.append(
            {"id": filename, "src": f"/static/uploads/{live_id}/{filename}"}
        )

    return jsonify(photo_urls)


@app.route("/delete-photo", methods=["POST"])
def delete_photo():
    data = request.get_json()

    live_id = data.get("live_id")
    filename = data.get("filename")

    if not live_id or not filename:
        return jsonify({"success": False, "message": "必要な情報がありません"}), 400

    safe_filename = secure_filename(filename)

    file_path = os.path.join(app.static_folder, "uploads", live_id, safe_filename)

    if not os.path.exists(file_path):
        return jsonify({"success": False, "message": "写真が見つかりません"}), 404

    os.remove(file_path)

    return jsonify({"success": True})


# setlist API
def search_setlist_artist(artist_name):
    url = "https://api.setlist.fm/rest/1.0/search/artists"

    headers = {"Accept": "application/json", "x-api-key": SETLIST_FM_API_KEY}

    params = {"artistName": artist_name, "sort": "relevance"}

    response = requests.get(url, headers=headers, params=params)

    print("status:", response.status_code)
    print("body:", response.text)

    response.raise_for_status()

    return response.json()


def get_artist_setlists(mbid):
    url = f"https://api.setlist.fm/rest/1.0/artist/{mbid}/setlists"

    headers = {"Accept": "application/json", "x-api-key": SETLIST_FM_API_KEY}

    for attempt in range(3):
        response = requests.get(url, headers=headers)

        print("attempt:", attempt + 1, "status:", response.status_code)

        if response.status_code == 200:
            return response.json()
        if response.status_code == 429:
            time.sleep(1)
            continue
        response.raise_for_status()

    return None


def count_song_frequency(setlist_data):
    counter = Counter()

    for live in setlist_data["setlist"]:
        for stage in live["sets"]["set"]:
            for song in stage["song"]:
                counter[song["name"]] += 1

    return counter


def count_opening_songs(setlist_data):
    counter = Counter()

    for live in setlist_data["setlist"]:
        sets = live.get("sets", {}).get("set", [])
        if not sets:
            continue
        songs = sets[0].get("song", [])
        if not songs:
            continue
        first_song = songs[0].get("name")
        if first_song:
            counter[first_song] += 1

    return counter


def count_encore_songs(setlist_data):
    counter = Counter()

    for live in setlist_data["setlist"]:
        for stage in live.get("sets", {}).get("set", []):
            if "encore" not in stage:
                continue
            for song in stage.get("song", []):
                name = song.get("name")

                if name:
                    counter[name] += 1

    return counter


# iTunes API
def search_itunes(song_name, artist_name):
    url = "https://itunes.apple.com/search"
    params = {
        "term": f"{artist_name} {song_name}",
        "entity": "song",
        "country": "JP",
        "limit": 1,
    }

    response = requests.get(url, params=params)

    response.raise_for_status()

    return response.json()


def get_song_details(song_names, artist_name):
    song_details = []
    for song_name in song_names:
        data = search_itunes(song_name, artist_name)
        if data["resultCount"] == 0:
            continue
        result = data["results"][0]

        song_details.append(
            {
                "title": result["trackName"],
                "artist": result["artistName"],
                "album": result["collectionName"],
                "artwork": result["artworkUrl100"].replace("100x100bb", "600x600bb"),
                "url": result["trackViewUrl"],
                "preview": result.get("previewUrl"),
            }
        )
    return song_details


@app.route("/test-itunes-list")
def test_itunes_list():
    songs = ["The Beginning", "Renegades", "We Are"]

    data = get_song_details(songs, "ONE OK ROCK")

    return jsonify(data)


# Genimi API

gemini_client = genai.Client(api_key=GEMINI_API_KEY)


@app.route("/setlist-prediction/<live_id>")
def setlist_prediction(live_id):
    return render_template("setlist_prediction.html", live_id=live_id)


@app.route("/predict-setlist", methods=["POST"])
def predict_setlist():
    data = request.get_json()
    artist_name = data["artist"]
    live_date = data["date"]
    venue = data["venue"]

    artist = search_setlist_artist(artist_name)
    mbid = artist["artist"][0]["mbid"]

    setlist_data = get_artist_setlists(mbid)

    if setlist_data is None:
        return (
            jsonify(
                {"success": False, "message": "setlist.fmのアクセス制限に達しました"}
            ),
            429,
        )

    counter = count_song_frequency(setlist_data)

    song_frequency_text = ""

    for title, count in counter.most_common(30):
        song_frequency_text += f"{title}: {count}回\n"

    prompt = f"""
    あなたはライブセットリストを予想するAIです
    アーティスト : {artist_name}
    ライブ日 : {live_date}
    会場 : {venue}
    過去30公演の演奏回数
    {song_frequency_text}
    
    20曲予想してください
    
    JSONの見返してください
    
    {{
        "setlist":[
            "曲名1",
            "曲名2"
        ]
    }}
    """

    response = gemini_client.interactions.create(model="gemini-3.6-flash", input=prompt)

    print("Gemini response:", response.output_text)

    text = response.output_text.strip()

    if text.startswith("```json"):
        text = text[7:]

    if text.endswith("```"):
        text = text[:-3]

    text = text.strip()

    result = json.loads(text)

    songs = result["setlist"]

    details = get_song_details(songs, artist_name)

    return jsonify(details)


@app.route("/playlist/<live_id>")
def playlist(live_id):
    return render_template("playlist.html", live_id=live_id)


@app.route("/playlist-make-beginner", methods=["POST"])
def playlist_make_beginner():
    data = request.get_json()
    artist_name = data["artist"]

    artist = search_setlist_artist(artist_name)

    prompt = f"""
    あなたはライブのプレイリストを作成するAIです
    アーティスト : {artist_name}
    初心者向けのプレイリストを作成してください
    20曲で提示
    
    JSONの見返してください
    
    {{
        "playlist":[
            "曲名1",
            "曲名2"
        ]
    }}
    """

    response = gemini_client.interactions.create(model="gemini-3.6-flash", input=prompt)
    print("Gemini response:", response.output_text)

    text = response.output_text.strip()

    if text.startswith("```json"):
        text = text[7:]

    if text.endswith("```"):
        text = text[:-3]

    text = text.strip()

    result = json.loads(text)

    songs = result["playlist"]

    details = get_song_details(songs, artist_name)

    return jsonify(details)


@app.route("/playlist-make-core", methods=["POST"])
def playlist_make_core():
    data = request.get_json()
    artist_name = data["artist"]

    artist = search_setlist_artist(artist_name)

    prompt = f"""
    あなたはライブのプレイリストを作成するAIです
    アーティスト : {artist_name}
    コアファン向けのプレイリストを作成してください
    20曲で提示
    
    JSONの見返してください
    
    {{
        "playlist":[
            "曲名1",
            "曲名2"
        ]
    }}
    """

    response = gemini_client.interactions.create(model="gemini-3.6-flash", input=prompt)
    print("Gemini response:", response.output_text)

    text = response.output_text.strip()

    if text.startswith("```json"):
        text = text[7:]

    if text.endswith("```"):
        text = text[:-3]

    text = text.strip()

    result = json.loads(text)

    songs = result["playlist"]

    details = get_song_details(songs, artist_name)

    return jsonify(details)


if __name__ == "__main__":
    app.run(debug=True, port=5001)
