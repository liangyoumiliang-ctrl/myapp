# Live Playlist App

A Flask-based web application that helps users prepare for upcoming concerts by managing live schedules, predicting setlists, and generating playlists with AI.

The project was created from a simple idea: make the time before a concert more exciting by helping users discover and revisit songs that may be played at the show.

## Features

* **Live schedule management**

  * Register upcoming concerts with artist, date, time, and venue information.
  * View upcoming events and past live history.

* **Google Calendar integration**

  * Connect to Google Calendar using OAuth.
  * Retrieve upcoming calendar events and import live schedules into the application.

* **AI-powered setlist prediction**

  * Retrieve historical setlist data from setlist.fm.
  * Aggregate song appearance frequency from past performances.
  * Send the concert information and historical statistics to the Gemini API.
  * Generate a predicted 20-song setlist for the upcoming concert.

* **AI-generated playlists**

  * Generate playlists for different listening needs, including beginner-oriented and core-fan-oriented selections.
  * Use Gemini to generate the song list and enrich each result with track information.

* **Music metadata integration**

  * Use the iTunes Search API to retrieve track titles, albums, artwork, preview URLs, and Apple Music links.
  * Convert artwork URLs to higher-resolution images for display.

* **Live history and photo management**

  * Save concert memories and upload photos for individual live events.
  * Add and delete uploaded photos from the application.

## How It Works

```text
User
  |
  v
Flask Web Application
  |
  +--------------------> Google Calendar API
  |
  +--> setlist.fm API
  |        |
  |        v
  |   Historical setlists
  |        |
  |        v
  |   Frequency analysis
  |        |
  |        v
  +----> Gemini API
            |
            v
     Predicted setlist
            |
            v
      iTunes Search API
            |
            v
   Track metadata / artwork
            |
            v
          UI
```

The setlist prediction flow combines external data retrieval, lightweight statistical aggregation, generative AI, and music metadata enrichment in a single end-to-end feature.

## Engineering Highlights

* Built both the frontend and backend of the application using **Flask, JavaScript, HTML, and CSS**.
* Integrated multiple external services: **Gemini API, setlist.fm API, iTunes Search API, and Google Calendar API**.
* Implemented an end-to-end pipeline from historical setlist retrieval to AI prediction and track presentation.
* Added retry handling for setlist.fm rate-limit responses (`HTTP 429`).
* Managed Gemini and setlist.fm credentials using environment variables loaded from `.env`.
* Used `secure_filename` when handling uploaded image files.
* Implemented Google OAuth-based calendar access on the frontend.
* Iteratively debugged authentication, API communication, data handling, and frontend integration issues while expanding the application.

## Tech Stack

| Category                         | Technologies                                           |
| -------------------------------- | ------------------------------------------------------ |
| Backend                          | Python, Flask                                          |
| Frontend                         | HTML, CSS, JavaScript                                  |
| Generative AI                    | Google Gemini API                                      |
| External APIs                    | setlist.fm API, iTunes Search API, Google Calendar API |
| Python Libraries                 | google-genai, python-dotenv, requests                  |
| Package / Environment Management | uv                                                     |
| Version Control                  | Git, GitHub                                            |

## Project Structure

```text
myapp/
├── app.py
├── templates/
├── static/
│   ├── images/
│   ├── javascript/
│   └── stylesheets/
├── pyproject.toml
├── uv.lock
└── README.md
```

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/liangyoumiliang-ctrl/myapp.git
cd myapp
```

### 2. Install dependencies

This project uses `uv`.

```bash
uv sync
```

### 3. Configure API keys

Create a `.env` file in the project root.

```env
GCP_API_KEY=your_gemini_api_key
SETLIST_API_KEY=your_setlist_fm_api_key
```

Do not commit your `.env` file or API keys to GitHub.

### 4. Run the application

```bash
uv run python app.py
```

The application runs locally at:

```text
http://127.0.0.1:5001
```

## What I Learned

Through this project, I gained practical experience in building a web application end to end rather than implementing isolated functions.

In particular, I learned how to:

* connect several APIs with different data formats and authentication methods;
* isolate the causes of errors across frontend, backend, authentication, and external APIs;
* design a feature by combining historical data with generative AI;
* transform API responses into information that is useful to the user;
* improve a product iteratively while considering both implementation and user experience.

## Future Improvements

* Improve the accuracy of setlist predictions by considering recency, tour information, venue characteristics, and song order.
* Introduce persistent storage instead of relying mainly on browser-side data.
* Add automated tests for backend API routes and prediction logic.
* Improve error handling and logging for external API failures.
* Refactor application logic into smaller modules for easier maintenance.
* Add deployment and CI/CD workflows.

## Author

**Ryosuke Mera**

GitHub: [liangyoumiliang-ctrl](https://github.com/liangyoumiliang-ctrl)
