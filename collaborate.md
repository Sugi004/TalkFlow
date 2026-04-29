# Collaboration Guide

This file explains how to collaborate on TalkFlow without breaking local setups, leaking secrets, or stepping on each other's work.

## Before You Start

1. Clone the repository and install dependencies for both apps.
2. Copy the example env files instead of creating ad hoc config:
   - `cp backend/.env.example backend/.env`
   - `cp frontend/.env.example frontend/.env.local`
3. Fill in your own local credentials. Do not reuse someone else's `.env`.
4. Never commit real secrets, API keys, database passwords, private keys, or `.pem` files.

## Branching Workflow

1. Pull the latest `main`.
2. Create a feature branch:
   - `feature/<short-name>`
   - `fix/<short-name>`
   - `docs/<short-name>`
3. Keep PRs focused. One feature or bug fix per branch is best for this repo.

## Daily Development Flow

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Required Checks Before Opening A PR

### Backend

```bash
cd backend
python3 -m unittest discover -s tests -v
```

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

If a change touches auth, password reset, email verification, uploads, or realtime flows, test that user journey manually as well.

## Secrets And Environment Rules

- `backend/.env` is local only and ignored by Git.
- `frontend/.env.local` is local only and ignored by Git.
- Update `backend/.env.example` or `frontend/.env.example` whenever a new env variable becomes required.
- If a secret is ever pasted into chat, logs, screenshots, or committed by mistake, rotate it immediately.

## Collaboration Rules For This Repo

- Do not rename env vars casually. This project already depends on specific names in both deployment and frontend code.
- If you change an API contract, update the frontend caller in the same branch.
- If you add a new auth route or redirect page, confirm it is included in the production frontend build.
- If you add a new email flow, document the required env vars in `README.md`.
- If you touch uploads or storage, verify both backend presigned URL generation and browser-side upload behavior.

## Review Checklist

- Does the branch include only the intended changes?
- Are test and build commands passing?
- Are new env vars documented?
- Are secrets excluded from the diff?
- Does the feature work locally end to end?

## Recommended Team Practices

- Protect `main` and merge through pull requests.
- Require at least one review for backend or auth-sensitive changes.
- Prefer squash merges for small feature branches.
- Keep deployment credentials in the hosting platform or secret manager, not in the repo.

## High-Risk Areas

Take extra care when editing:

- `backend/routers/auth.py`
- `backend/backend_auth.py`
- `backend/email_utils.py`
- `backend/message_crypto.py`
- `frontend/lib/auth.ts`
- `frontend/app/login/page.tsx`
- `frontend/app/register/page.tsx`

These files affect login, email verification, password reset, encryption, and onboarding flows.
