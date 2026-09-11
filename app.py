from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from authlib.integrations.flask_client import OAuth
import os
from werkzeug.utils import secure_filename
import requests
from collections import Counter
from google import genai
import json
import time
from dotenv import load_dotenv
import psycopg2
import cloudinary
import cloudinary.uploader
from difflib import SequenceMatcher
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

load_dotenv()

GEMINI_API_KEY = os.getenv("GCP_API_KEY")

SETLIST_FM_API_KEY = os.getenv("SETLIST_API_KEY")

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

app = Flask(__name__)

app.secret_key = os.getenv("FLASK_SECRET_KEY")
oauth = OAuth(app)
google = oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": (
            "openid "
            "email "
            "profile "
            "https://www.googleapis.com/auth/calendar.app.created"
        )
    },
)


def get_db_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL_POOLED"), connect_timeout=10)


def init_db():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            google_user_id TEXT UNIQUE NOT NULL,
            email TEXT,
            google_name TEXT,
            display_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS lives (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            artist TEXT NOT NULL,
            live_date DATE NOT NULL,
            start_time TIME,
            venue TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        );
    """)

    cur.execute("""
        ALTER TABLE lives
        ADD COLUMN IF NOT EXISTS google_event_id TEXT;
    """)

    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS
        unique_user_google_event
        ON lives (user_id, google_event_id)
        WHERE google_event_id IS NOT NULL;
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS setlist_songs (
            id SERIAL PRIMARY KEY,
            live_id INTEGER NOT NULL,
            song_title TEXT NOT NULL,
            song_order INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (live_id)
                REFERENCES lives(id)
                ON DELETE CASCADE
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS live_memos (
            id SERIAL PRIMARY KEY,
            live_id INTEGER UNIQUE NOT NULL,
            memo TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (live_id)
                REFERENCES lives(id)
                ON DELETE CASCADE
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS live_photos (
            id SERIAL PRIMARY KEY,
            live_id INTEGER NOT NULL,
            photo_url TEXT NOT NULL,
            public_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (live_id)
                REFERENCES lives(id)
                ON DELETE CASCADE
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS playlist_songs (
            id SERIAL PRIMARY KEY,
            live_id INTEGER NOT NULL,
            playlist_type TEXT NOT NULL,
            song_title TEXT NOT NULL,
            artist_name TEXT,
            album_name TEXT,
            artwork_url TEXT,
            song_url TEXT,
            preview_url TEXT,
            song_order INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (live_id)
                REFERENCES lives(id)
                ON DELETE CASCADE
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS predicted_setlist_songs (
            id SERIAL PRIMARY KEY,
            live_id INTEGER NOT NULL,
            song_title TEXT NOT NULL,
            artist_name TEXT,
            album_name TEXT,
            artwork_url TEXT,
            song_url TEXT,
            preview_url TEXT,
            song_order INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (live_id)
                REFERENCES lives(id)
                ON DELETE CASCADE
        );
    """)

    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS google_access_token TEXT;
    """)

    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
    """)

    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS google_token_expires_at BIGINT;
    """)

    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
    """)

    conn.commit()

    cur.close()
    conn.close()


def get_user_by_google_id(google_user_id):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            id,
            google_user_id,
            email,
            google_name,
            display_name
        FROM users
        WHERE google_user_id = %s
    """,
        (google_user_id,),
    )

    row = cur.fetchone()

    cur.close()
    conn.close()

    if row is None:
        return None

    return {
        "id": row[0],
        "google_user_id": row[1],
        "email": row[2],
        "google_name": row[3],
        "display_name": row[4],
    }


# googleaccount_and_calendar連携
def get_valid_google_access_token(user_id):

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            google_access_token,
            google_refresh_token,
            google_token_expires_at
        FROM users
        WHERE id = %s
        """,
        (user_id,),
    )

    row = cur.fetchone()

    cur.close()
    conn.close()

    if not row:
        return None

    access_token = row[0]
    refresh_token = row[1]
    expires_at = row[2]

    # まだ有効ならそのまま使う
    if access_token and expires_at and time.time() < expires_at - 60:
        return access_token

    # refresh tokenがない場合
    if not refresh_token:
        return None

    response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=10,
    )

    if not response.ok:
        print("Google token refresh error:", response.text)
        return None

    token_data = response.json()

    new_access_token = token_data.get("access_token")

    expires_in = token_data.get("expires_in", 3600)

    new_expires_at = int(time.time()) + expires_in

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE users
        SET
            google_access_token = %s,
            google_token_expires_at = %s
        WHERE id = %s
        """,
        (
            new_access_token,
            new_expires_at,
            user_id,
        ),
    )

    conn.commit()

    cur.close()
    conn.close()

    return new_access_token


@app.route("/api/calendar/events", methods=["POST"])
def add_calendar_event():

    user = session.get("user")

    if not user:
        return jsonify({"error": "ログインが必要です。"}), 401

    data = request.get_json() or {}

    artist = data.get("artist", "").strip()
    live_date = data.get("date", "").strip()
    start_time = data.get("time", "").strip()
    venue = data.get("venue", "").strip()

    if not artist or not live_date or not start_time:
        return (
            jsonify({"error": "アーティスト名、日付、開演時間を入力してください。"}),
            400,
        )

    # Googleアクセストークン取得
    access_token = get_valid_google_access_token(user["id"])

    if not access_token:
        return (
            jsonify(
                {
                    "error": "Google Calendarの認証情報がありません。再ログインしてください。"
                }
            ),
            401,
        )

    # ユーザー専用Re:Liveカレンダー取得
    # なければ自動作成
    calendar_id = get_or_create_relive_calendar(user["id"], access_token)

    if not calendar_id:
        return jsonify({"error": "Re:Liveカレンダーを取得できませんでした。"}), 500

    # 日時作成
    try:

        tokyo = ZoneInfo("Asia/Tokyo")

        start_dt = datetime.fromisoformat(f"{live_date}T{start_time}").replace(
            tzinfo=tokyo
        )

        # ライブ終了時間は仮に3時間後
        end_dt = start_dt + timedelta(hours=3)

    except ValueError:

        return jsonify({"error": "日付または時間の形式が正しくありません。"}), 400

    event_data = {
        "summary": f"{artist} ライブ",
        "location": venue,
        "description": "Re:Liveから追加",
        "start": {"dateTime": start_dt.isoformat(), "timeZone": "Asia/Tokyo"},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": "Asia/Tokyo"},
    }

    # calendar_idをURL用にエンコード
    encoded_calendar_id = requests.utils.quote(calendar_id, safe="")

    url = (
        "https://www.googleapis.com/calendar/v3/calendars/"
        f"{encoded_calendar_id}/events"
    )

    try:

        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=event_data,
            timeout=10,
        )

        if not response.ok:

            print("Google Calendar追加エラー:", response.text)

            return (
                jsonify({"error": "Googleカレンダーへの追加に失敗しました。"}),
                response.status_code,
            )

        created_event = response.json()

        return jsonify({"success": True, "event_id": created_event.get("id")})

    except requests.RequestException as error:

        print("Google Calendar通信エラー:", error)

        return jsonify({"error": "Google Calendarとの通信に失敗しました。"}), 500


@app.route("/api/calendar/events", methods=["GET"])
def get_calendar_events():

    user = session.get("user")

    if not user:
        return jsonify({"error": "ログインが必要です。"}), 401

    # Googleアクセストークン取得
    access_token = get_valid_google_access_token(user["id"])

    if not access_token:
        return (
            jsonify(
                {
                    "error": "Google Calendarの認証情報がありません。再ログインしてください。"
                }
            ),
            401,
        )

    # ユーザー専用のRe:Liveカレンダー取得
    # まだなければ自動作成
    calendar_id = get_or_create_relive_calendar(user["id"], access_token)

    if not calendar_id:
        return jsonify({"error": "Re:Liveカレンダーを取得できませんでした。"}), 500

    # Calendar IDをURL用にエンコード
    encoded_calendar_id = requests.utils.quote(calendar_id, safe="")

    # ユーザー専用Re:Liveカレンダー
    url = (
        "https://www.googleapis.com/calendar/v3/calendars/"
        f"{encoded_calendar_id}/events"
    )

    # 現在時刻より後の予定だけ取得
    now = datetime.now(timezone.utc).isoformat()

    params = {
        "timeMin": now,
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": 50,
    }

    try:

        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
            timeout=10,
        )

        if not response.ok:

            print("Google Calendar取得エラー:", response.text)

            return (
                jsonify({"error": "Googleカレンダーの取得に失敗しました。"}),
                response.status_code,
            )

        calendar_data = response.json()

        events = []

        for event in calendar_data.get("items", []):

            start_data = event.get("start", {})

            start = start_data.get("dateTime") or start_data.get("date")

            events.append(
                {
                    "id": event.get("id"),
                    "title": event.get("summary", "タイトルなし"),
                    "start": start,
                    "location": event.get("location", ""),
                }
            )

        return jsonify({"items": events})

    except requests.RequestException as error:

        print("Google Calendar通信エラー:", error)

        return jsonify({"error": "Google Calendarとの通信に失敗しました。"}), 500


def get_or_create_relive_calendar(user_id, access_token):

    # =========================
    # DBに既存calendar_idがあるか確認
    # =========================

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT google_calendar_id
        FROM users
        WHERE id = %s
        """,
        (user_id,),
    )

    row = cur.fetchone()

    cur.close()
    conn.close()

    if row and row[0]:
        return row[0]

    # =========================
    # Google Calendarに
    # Re:Liveカレンダーを作成
    # =========================

    response = requests.post(
        "https://www.googleapis.com/calendar/v3/calendars",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json={
            "summary": "Re:Live",
            "description": "Re:Liveのライブ予定用カレンダー",
            "timeZone": "Asia/Tokyo",
        },
        timeout=10,
    )

    if not response.ok:

        print("Re:Live Calendar作成エラー:", response.text)

        return None

    calendar_data = response.json()

    calendar_id = calendar_data.get("id")

    if not calendar_id:
        return None

    # =========================
    # calendar_idをNeonへ保存
    # =========================

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE users

        SET google_calendar_id = %s

        WHERE id = %s
        """,
        (calendar_id, user_id),
    )

    conn.commit()

    cur.close()
    conn.close()

    return calendar_id


@app.route("/")
def home():
    return render_template("index.html", user=session.get("user"))


# login/logout
@app.route("/login")
def login():

    redirect_uri = url_for("auth_callback", _external=True)

    return google.authorize_redirect(
        redirect_uri,
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )


@app.route("/set-name", methods=["GET", "POST"])
def set_name():
    user = session.get("user")

    if not user:
        return redirect(url_for("login"))

    if request.method == "POST":

        display_name = request.form.get("display_name", "").strip()

        if not display_name:
            return render_template("set_name.html", user=user)

        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            """
            UPDATE users

            SET display_name = %s

            WHERE id = %s
            """,
            (display_name, user["id"]),
        )

        conn.commit()

        cur.close()
        conn.close()

        # DBから最新情報を取得
        db_user = get_user_by_google_id(user["google_user_id"])

        # sessionも更新
        session["user"] = {
            "id": db_user["id"],
            "google_user_id": db_user["google_user_id"],
            "name": db_user["google_name"],
            "display_name": db_user["display_name"],
            "email": db_user["email"],
            "picture": user.get("picture"),
        }

        return redirect(url_for("home"))

    return render_template("set_name.html", user=user)


@app.route("/login/change")
def login_change():
    redirect_uri = url_for("auth_callback", _external=True)
    return google.authorize_redirect(redirect_uri, prompt="select_account")


@app.route("/login/callback")
def auth_callback():

    token = google.authorize_access_token()

    access_token = token.get("access_token")
    refresh_token = token.get("refresh_token")

    expires_at = int(token["expires_at"]) if token.get("expires_at") else None

    user_info = token.get("userinfo")

    google_user_id = user_info["sub"]
    google_name = user_info.get("name")
    email = user_info.get("email")
    picture = user_info.get("picture")

    db_user = get_user_by_google_id(google_user_id)

    # =========================
    # 初回ログイン
    # =========================

    if db_user is None:

        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO users (
                google_user_id,
                email,
                google_name,
                display_name,
                google_access_token,
                google_refresh_token,
                google_token_expires_at
            )
            VALUES (
                %s,
                %s,
                %s,
                NULL,
                %s,
                %s,
                %s
            )
            RETURNING id
        """,
            (
                google_user_id,
                email,
                google_name,
                access_token,
                refresh_token,
                expires_at,
            ),
        )

        user_id = cur.fetchone()[0]

        conn.commit()

        cur.close()
        conn.close()

        calendar_id = get_or_create_relive_calendar(user_id, access_token)

        session["user"] = {
            "id": user_id,
            "google_user_id": google_user_id,
            "name": google_name,
            "display_name": None,
            "email": email,
            "picture": picture,
        }

        return redirect(url_for("set_name"))

    # =========================
    # 既存ユーザー
    # =========================

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE users
        SET
            google_access_token = %s,

            google_refresh_token =
                COALESCE(
                    %s,
                    google_refresh_token
                ),

            google_token_expires_at = %s,

            email = %s,
            google_name = %s

        WHERE google_user_id = %s
    """,
        (access_token, refresh_token, expires_at, email, google_name, google_user_id),
    )

    conn.commit()

    cur.close()
    conn.close()

    calendar_id = get_or_create_relive_calendar(db_user["id"], access_token)

    session["user"] = {
        "id": db_user["id"],
        "google_user_id": db_user["google_user_id"],
        "name": google_name,
        "display_name": db_user["display_name"],
        "email": email,
        "picture": picture,
    }

    return redirect(url_for("home"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


# database関連
@app.route("/api/lives", methods=["POST"])
def add_live_api():
    user = session.get("user")

    if not user:
        return jsonify({"status": "error", "message": "ログインしてください"}), 401

    data = request.get_json()

    artist = data.get("artist")
    live_date = data.get("date")
    start_time = data.get("time")
    venue = data.get("venue")
    google_event_id = data.get("google_event_id")

    if not artist or not live_date:
        return jsonify({"status": "error", "message": "artistとdateは必須です"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO lives (
            user_id,
            google_event_id,
            artist,
            live_date,
            start_time,
            venue
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id;
    """,
        (
            user["id"],
            google_event_id,
            artist,
            live_date,
            start_time if start_time else None,
            venue,
        ),
    )

    live_id = cur.fetchone()[0]

    conn.commit()

    cur.close()
    conn.close()

    return jsonify({"status": "success", "id": live_id})


@app.route("/api/lives", methods=["GET"])
def get_lives_api():
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            id,
            google_event_id,
            artist,
            live_date,
            start_time,
            venue
        FROM lives
        WHERE user_id = %s
        ORDER BY live_date ASC, start_time ASC
    """,
        (user["id"],),
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    lives = []

    for row in rows:
        lives.append(
            {
                "id": row[0],
                "google_event_id": row[1],
                "artist": row[2],
                "live_date": row[3].isoformat(),
                "start_time": row[4].strftime("%H:%M") if row[4] else None,
                "venue": row[5],
            }
        )

    return jsonify(lives)


@app.route("/api/lives/<int:live_id>", methods=["DELETE"])
def delete_live_api(live_id):
    user = session.get("user")

    if not user:
        return jsonify({"status": "error", "message": "ログインしてください"}), 401

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        DELETE FROM lives
        WHERE id = %s
        AND user_id = %s
        RETURNING id;
    """,
        (live_id, user["id"]),
    )

    deleted = cur.fetchone()

    conn.commit()

    cur.close()
    conn.close()

    if deleted is None:
        return jsonify({"status": "error", "message": "ライブが見つかりません"}), 404

    return jsonify({"status": "success"})


# DB-setlist情報取得
@app.route("/api/lives/<int:live_id>/setlist", methods=["GET"])
def get_setlist_api(live_id):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            setlist_songs.id,
            setlist_songs.song_title,
            setlist_songs.song_order
        FROM setlist_songs
        JOIN lives
            ON setlist_songs.live_id = lives.id
        WHERE setlist_songs.live_id = %s
        AND lives.user_id = %s
        ORDER BY setlist_songs.song_order ASC
    """,
        (live_id, user["id"]),
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    setlist = []

    for row in rows:
        setlist.append({"id": row[0], "title": row[1], "order": row[2]})

    return jsonify(setlist)


# DB-曲追加
@app.route("/api/lives/<int:live_id>/setlist", methods=["POST"])
def add_setlist_song_api(live_id):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    data = request.get_json()

    title = data.get("title")

    if not title:
        return jsonify({"message": "曲名を入力してください"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    # このライブがログイン中ユーザーのものか確認
    cur.execute(
        """
        SELECT id
        FROM lives
        WHERE id = %s
        AND user_id = %s
    """,
        (live_id, user["id"]),
    )

    live = cur.fetchone()

    if live is None:
        cur.close()
        conn.close()

        return jsonify({"message": "ライブが見つかりません"}), 404

    # 現在の最後の曲順を取得
    cur.execute(
        """
        SELECT COALESCE(MAX(song_order), 0)
        FROM setlist_songs
        WHERE live_id = %s
    """,
        (live_id,),
    )

    last_order = cur.fetchone()[0]

    new_order = last_order + 1

    # 曲を追加
    cur.execute(
        """
        INSERT INTO setlist_songs (
            live_id,
            song_title,
            song_order
        )
        VALUES (%s, %s, %s)
        RETURNING id;
    """,
        (live_id, title, new_order),
    )

    song_id = cur.fetchone()[0]

    conn.commit()

    cur.close()
    conn.close()

    return jsonify({"id": song_id, "title": title, "order": new_order})


# DB-曲削除
@app.route("/api/lives/<int:live_id>/setlist/<int:song_id>", methods=["DELETE"])
def delete_setlist_song_api(live_id, song_id):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        DELETE FROM setlist_songs
        USING lives
        WHERE setlist_songs.id = %s
        AND setlist_songs.live_id = %s
        AND lives.id = setlist_songs.live_id
        AND lives.user_id = %s
        RETURNING setlist_songs.id;
    """,
        (song_id, live_id, user["id"]),
    )

    deleted = cur.fetchone()

    conn.commit()

    cur.close()
    conn.close()

    if deleted is None:
        return jsonify({"message": "曲が見つかりません"}), 404

    return jsonify({"status": "success"})


# DB-memo取得
@app.route("/api/lives/<int:live_id>/memo", methods=["GET"])
def get_memo_api(live_id):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT live_memos.memo
        FROM live_memos
        JOIN lives
            ON live_memos.live_id = lives.id
        WHERE live_memos.live_id = %s
        AND lives.user_id = %s
    """,
        (live_id, user["id"]),
    )

    row = cur.fetchone()

    cur.close()
    conn.close()

    return jsonify({"memo": row[0] if row else ""})


# DB-memo保存
@app.route("/api/lives/<int:live_id>/memo", methods=["POST"])
def save_memo_api(live_id):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    data = request.get_json()

    memo = data.get("memo", "")

    conn = get_db_connection()
    cur = conn.cursor()

    # このライブが本人のものか確認
    cur.execute(
        """
        SELECT id
        FROM lives
        WHERE id = %s
        AND user_id = %s
    """,
        (live_id, user["id"]),
    )

    live = cur.fetchone()

    if live is None:
        cur.close()
        conn.close()

        return jsonify({"message": "ライブが見つかりません"}), 404

    cur.execute(
        """
        INSERT INTO live_memos (
            live_id,
            memo
        )
        VALUES (%s, %s)

        ON CONFLICT (live_id)
        DO UPDATE SET
            memo = EXCLUDED.memo,
            updated_at = CURRENT_TIMESTAMP
    """,
        (live_id, memo),
    )

    conn.commit()

    cur.close()
    conn.close()

    return jsonify({"status": "success"})


# DB-playlist
@app.route("/api/lives/<int:live_id>/playlist", methods=["POST"])
def save_playlist_api(live_id):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    data = request.get_json()

    playlist_type = data.get("type")
    songs = data.get("songs", [])

    if playlist_type not in ["beginner", "core"]:
        return jsonify({"message": "プレイリストの種類が不正です"}), 400

    if not songs:
        return jsonify({"message": "曲がありません"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    # このライブがログイン中ユーザーのものか確認
    cur.execute(
        """
        SELECT id
        FROM lives
        WHERE id = %s
        AND user_id = %s
    """,
        (live_id, user["id"]),
    )

    live = cur.fetchone()

    if live is None:
        cur.close()
        conn.close()

        return jsonify({"message": "ライブが見つかりません"}), 404

    try:
        # 同じ種類の古いプレイリストを削除
        cur.execute(
            """
            DELETE FROM playlist_songs
            WHERE live_id = %s
            AND playlist_type = %s
        """,
            (live_id, playlist_type),
        )

        # 新しいプレイリストを保存
        for index, song in enumerate(songs, start=1):

            cur.execute(
                """
                INSERT INTO playlist_songs (
                    live_id,
                    playlist_type,
                    song_title,
                    artist_name,
                    album_name,
                    artwork_url,
                    song_url,
                    preview_url,
                    song_order
                )
                VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s
                )
            """,
                (
                    live_id,
                    playlist_type,
                    song.get("title"),
                    song.get("artist"),
                    song.get("album"),
                    song.get("artwork"),
                    song.get("url"),
                    song.get("preview"),
                    index,
                ),
            )

        conn.commit()

        return jsonify({"status": "success"})

    except Exception as e:
        conn.rollback()

        print("PLAYLIST SAVE ERROR:", e)

        return jsonify({"message": "プレイリストを保存できませんでした"}), 500

    finally:
        cur.close()
        conn.close()


# DB-playlist取得
@app.route("/api/lives/<int:live_id>/playlist/<playlist_type>", methods=["GET"])
def get_playlist_api(live_id, playlist_type):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    if playlist_type not in ["beginner", "core"]:
        return jsonify({"message": "プレイリストの種類が不正です"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            playlist_songs.id,
            playlist_songs.song_title,
            playlist_songs.artist_name,
            playlist_songs.album_name,
            playlist_songs.artwork_url,
            playlist_songs.song_url,
            playlist_songs.preview_url,
            playlist_songs.song_order
        FROM playlist_songs
        JOIN lives
            ON playlist_songs.live_id = lives.id
        WHERE playlist_songs.live_id = %s
        AND playlist_songs.playlist_type = %s
        AND lives.user_id = %s
        ORDER BY playlist_songs.song_order ASC
    """,
        (live_id, playlist_type, user["id"]),
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    songs = []

    for row in rows:
        songs.append(
            {
                "id": row[0],
                "title": row[1],
                "artist": row[2],
                "album": row[3],
                "artwork": row[4],
                "url": row[5],
                "preview": row[6],
                "order": row[7],
            }
        )

    return jsonify(songs)


# DB-セトリ予想保存
@app.route("/api/lives/<int:live_id>/prediction", methods=["POST"])
def save_prediction_api(live_id):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    data = request.get_json()
    songs = data.get("songs", [])

    if not songs:
        return jsonify({"message": "予想結果がありません"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    # このライブがログイン中ユーザーのものか確認
    cur.execute(
        """
        SELECT id
        FROM lives
        WHERE id = %s
        AND user_id = %s
    """,
        (live_id, user["id"]),
    )

    live = cur.fetchone()

    if live is None:
        cur.close()
        conn.close()

        return jsonify({"message": "ライブが見つかりません"}), 404

    try:
        # 以前の予想結果を削除
        cur.execute(
            """
            DELETE FROM predicted_setlist_songs
            WHERE live_id = %s
        """,
            (live_id,),
        )

        # 新しい予想結果を保存
        for index, song in enumerate(songs, start=1):

            cur.execute(
                """
                INSERT INTO predicted_setlist_songs (
                    live_id,
                    song_title,
                    artist_name,
                    album_name,
                    artwork_url,
                    song_url,
                    preview_url,
                    song_order
                )
                VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s, %s
                )
            """,
                (
                    live_id,
                    song.get("title"),
                    song.get("artist"),
                    song.get("album"),
                    song.get("artwork"),
                    song.get("url"),
                    song.get("preview"),
                    index,
                ),
            )

        conn.commit()

        return jsonify({"status": "success"})

    except Exception as e:
        conn.rollback()

        print("PREDICTION SAVE ERROR:", e)

        return jsonify({"message": "予想結果を保存できませんでした"}), 500

    finally:
        cur.close()
        conn.close()


# 保存済みセトリ予想取得
@app.route("/api/lives/<int:live_id>/prediction", methods=["GET"])
def get_prediction_api(live_id):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            predicted_setlist_songs.id,
            predicted_setlist_songs.song_title,
            predicted_setlist_songs.artist_name,
            predicted_setlist_songs.album_name,
            predicted_setlist_songs.artwork_url,
            predicted_setlist_songs.song_url,
            predicted_setlist_songs.preview_url,
            predicted_setlist_songs.song_order
        FROM predicted_setlist_songs
        JOIN lives
            ON predicted_setlist_songs.live_id = lives.id
        WHERE predicted_setlist_songs.live_id = %s
        AND lives.user_id = %s
        ORDER BY predicted_setlist_songs.song_order ASC
    """,
        (live_id, user["id"]),
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    songs = []

    for row in rows:
        songs.append(
            {
                "id": row[0],
                "title": row[1],
                "artist": row[2],
                "album": row[3],
                "artwork": row[4],
                "url": row[5],
                "preview": row[6],
                "order": row[7],
            }
        )

    return jsonify(songs)


@app.route("/addlive")
def addlive():
    return render_template("addlive.html", user=session.get("user"))


@app.route("/livelist")
def livelist():
    return render_template("livelist.html", user=session.get("user"))


@app.route("/history")
def history():
    return render_template("history.html", user=session.get("user"))


@app.route("/history-detail/<live_id>")
def history_detail(live_id):
    return render_template(
        "history_detail.html", live_id=live_id, user=session.get("user")
    )


@app.route("/upload-photo", methods=["POST"])
def upload_photo():
    user = session.get("user")

    if not user:
        return jsonify({"success": False, "message": "ログインしてください"}), 401

    photo = request.files.get("photo")
    live_id = request.form.get("live_id")

    if photo is None:
        return jsonify({"success": False, "message": "写真がありません"}), 400

    if not live_id:
        return jsonify({"success": False, "message": "ライブIDがありません"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    # このライブがログイン中ユーザーのものか確認
    cur.execute(
        """
        SELECT id
        FROM lives
        WHERE id = %s
        AND user_id = %s
    """,
        (live_id, user["id"]),
    )

    live = cur.fetchone()

    if live is None:
        cur.close()
        conn.close()

        return jsonify({"success": False, "message": "ライブが見つかりません"}), 404

    try:
        # Cloudinaryへアップロード
        upload_result = cloudinary.uploader.upload(
            photo.stream, folder=f"relive/{user['id']}/{live_id}", resource_type="image"
        )

        photo_url = upload_result["secure_url"]
        public_id = upload_result["public_id"]

        # Neonへ写真情報を保存
        cur.execute(
            """
            INSERT INTO live_photos (
                live_id,
                photo_url,
                public_id
            )
            VALUES (%s, %s, %s)
            RETURNING id;
        """,
            (live_id, photo_url, public_id),
        )

        photo_id = cur.fetchone()[0]

        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"success": True, "id": photo_id, "url": photo_url})

    except Exception as e:
        conn.rollback()

        cur.close()
        conn.close()

        print("PHOTO UPLOAD ERROR:", e)

        return (
            jsonify(
                {"success": False, "message": "写真をアップロードできませんでした"}
            ),
            500,
        )


@app.route("/photos/<int:live_id>")
def get_photo(live_id):
    user = session.get("user")

    if not user:
        return jsonify({"message": "ログインしてください"}), 401

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            live_photos.id,
            live_photos.photo_url,
            live_photos.public_id
        FROM live_photos
        JOIN lives
            ON live_photos.live_id = lives.id
        WHERE live_photos.live_id = %s
        AND lives.user_id = %s
        ORDER BY live_photos.created_at ASC
    """,
        (live_id, user["id"]),
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    photos = []

    for row in rows:
        photos.append({"id": row[0], "src": row[1], "public_id": row[2]})

    return jsonify(photos)


@app.route("/delete-photo", methods=["POST"])
def delete_photo():
    user = session.get("user")

    if not user:
        return jsonify({"success": False, "message": "ログインしてください"}), 401

    data = request.get_json()

    photo_id = data.get("photo_id")
    live_id = data.get("live_id")

    if not photo_id or not live_id:
        return jsonify({"success": False, "message": "必要な情報がありません"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    # 自分のライブの写真か確認しつつpublic_idを取得
    cur.execute(
        """
        SELECT live_photos.public_id
        FROM live_photos
        JOIN lives
            ON live_photos.live_id = lives.id
        WHERE live_photos.id = %s
        AND live_photos.live_id = %s
        AND lives.user_id = %s
    """,
        (photo_id, live_id, user["id"]),
    )

    row = cur.fetchone()

    if row is None:
        cur.close()
        conn.close()

        return jsonify({"success": False, "message": "写真が見つかりません"}), 404

    public_id = row[0]

    try:
        # Cloudinaryから画像を削除
        cloudinary.uploader.destroy(public_id, resource_type="image")

        # Neonから写真情報を削除
        cur.execute(
            """
            DELETE FROM live_photos
            WHERE id = %s
            AND live_id = %s
        """,
            (photo_id, live_id),
        )

        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"success": True})

    except Exception as e:
        conn.rollback()

        cur.close()
        conn.close()

        print("PHOTO DELETE ERROR:", e)

        return jsonify({"success": False, "message": "写真を削除できませんでした"}), 500


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
        "limit": 10,
    }

    response = requests.get(url, params=params)

    response.raise_for_status()

    return response.json()


def normalize_song_title(title):
    return (
        title.lower()
        .replace(" ", "")
        .replace("　", "")
        .replace("-", "")
        .replace("_", "")
    )


def get_song_details(song_names, artist_name):
    song_details = []

    for song_name in song_names:
        data = search_itunes(song_name, artist_name)

        if data["resultCount"] == 0:
            continue

        target_title = normalize_song_title(song_name)

        best_result = None
        best_score = 0

        for result in data["results"]:
            itunes_title = normalize_song_title(result["trackName"])

            score = SequenceMatcher(None, target_title, itunes_title).ratio()

            if score > best_score:
                best_score = score
                best_result = result

        if best_result is None:
            continue

        print(
            "Gemini:",
            song_name,
            "→ iTunes:",
            best_result["trackName"],
            "score:",
            round(best_score, 2),
        )

        song_details.append(
            {
                "title": best_result["trackName"],
                "artist": best_result["artistName"],
                "album": best_result["collectionName"],
                "artwork": best_result["artworkUrl100"].replace(
                    "100x100bb", "600x600bb"
                ),
                "url": best_result["trackViewUrl"],
                "preview": best_result.get("previewUrl"),
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
    return render_template(
        "setlist_prediction.html", live_id=live_id, user=session.get("user")
    )


@app.route("/predict-setlist", methods=["POST"])
def predict_setlist():
    data = request.get_json()
    print("予想API受信データ:", data)
    artist_name = data.get("artist", "").strip()
    live_date = data.get("date", "").strip()
    venue = data.get("venue", "").strip()
    if not artist_name or not live_date:
        return jsonify({"error": "artist または date がありません。"}), 400

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
    return render_template("playlist.html", live_id=live_id, user=session.get("user"))


@app.route("/playlist-make-beginner", methods=["POST"])
def playlist_make_beginner():
    data = request.get_json()
    artist_name = data["artist"]

    artist = search_setlist_artist(artist_name)

    prompt = f"""
    あなたはライブのプレイリストを作成するAIです
    アーティスト : {artist_name}
    初心者向けのプレイリストを作成してください
    条件：
    - 20曲
    - 同じ曲を重複して含めない
    - 曲名の表記ゆれも同一曲として扱う
    - 必ず20曲すべて異なる曲にする
        
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
    条件：
    - 20曲
    - 同じ曲を重複して含めない
    - 曲名の表記ゆれも同一曲として扱う
    - 必ず20曲すべて異なる曲にする
    
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
