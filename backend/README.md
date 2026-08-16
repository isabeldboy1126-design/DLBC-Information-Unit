# DLBC Information Unit App — Backend

Python + FastAPI backend for the DLBC Information Unit App.

## Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.
API keys and secrets must never be committed to version control.
