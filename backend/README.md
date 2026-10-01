# Translate Platform - Backend API Documentation

This is the FastAPI backend for the Translate Platform. It provides language translation and NLP analysis capabilities.

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Virtual environment (recommended)

### Installation

1. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Download the SpaCy NLP model:
   ```bash
   python -m spacy download en_core_web_sm
   ```

4. Environment Configuration:
   Copy `.env.example` to `.env` and adjust the variables if necessary.
   ```bash
   cp .env.example .env
   ```

### Running the Server

Start the development server with auto-reload:
```bash
uvicorn src.main:app --reload
```
The API will be available at `http://localhost:8000` (or as configured in `.env`).

Interactive API Documentation (Swagger UI) is automatically available at:
👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**

---

## 📚 API Endpoints

### 1. Health Check
Checks if the backend service is running and healthy.

- **Endpoint:** `GET /health`
- **Full Local URL:** `http://localhost:8000/health`
- **Tags:** `health`

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "Translate Platform API",
  "version": "1.0.0"
}
```

---

### 2. Translate & Analyze (Full NLP)
Provides full NLP analysis (POS tagging and SVO structure) alongside translation. It intelligently skips unnecessary steps based on the input text to optimize performance.

#### **A. Vietnamese to English**
- **Endpoint:** `POST /api/v1/translate/vi-en`
- **Description:** Translates Vietnamese to English and performs NLP analysis on the English result. If the input is already English, it bypasses translation and NLP for immediate response.

#### **B. English to Vietnamese**
- **Endpoint:** `POST /api/v1/translate/en-vi`
- **Description:** Translates English to Vietnamese and performs NLP analysis on the English input. These two heavy tasks are run **in parallel** for maximum speed. If the input is Vietnamese, it bypasses processing.

**Request Body (`application/json`):**
```json
{
  "raw_text": "Xin chào, ứng dụng này rất tuyệt vời."
}
```

**Response (200 OK):**
```json
{
  "original_text": "Xin chào, ứng dụng này rất tuyệt vời.",
  "translated_text": "Hello, this app is awesome.",
  "english_analysis": "Hello, this app is awesome.",
  "pos_tags": [
    {
      "text": "Hello",
      "pos": "INTJ",
      "tag": "UH",
      "dep": "intj",
      "meaning": "Xin chào"
    }
  ],
  "structure": {
    "subject": "app",
    "verb": "is",
    "object": "awesome"
  }
}
```

---

### 3. Simple Translate (Fast API for Extensions)
A lightweight API designed for third-party integrations (e.g., Chrome extensions). It performs raw translation without loading NLP models or fetching vocabulary meanings.

- **Endpoints:**
  - `POST /api/v1/translate/simple/vi-en`
  - `POST /api/v1/translate/simple/en-vi`
- **Description:** Extremely fast, bypasses processing if the input language contradicts the requested mode.

**Request Body (`application/json`):**
```json
{
  "raw_text": "Xin chào"
}
```

**Response (200 OK):**
```json
{
  "original_text": "Xin chào",
  "translated_text": "Hello",
  "source_lang": "vi"
}
```

**Common Error Responses:**
- `400 Bad Request`: If `raw_text` is empty.
- `429 Too Many Requests`: If the rate limit is exceeded.
- `500 Internal Server Error`: For internal processing or translation failures.

---

## 🛠️ Architecture

The backend follows a production-ready layered architecture:

- **`src/main.py`**: Application factory, middleware, and exception handlers.
- **`src/config.py`**: Centralized configuration management using `pydantic-settings`.
- **`src/api/`**: API routing layer (e.g., `v1`, `health`).
- **`src/core/`**: Cross-cutting concerns like custom exceptions and structured logging (`loguru`).
- **`src/modules/`**: Feature-based modules containing business logic (`service.py`), routes (`router.py`), and data models (`schemas.py`).