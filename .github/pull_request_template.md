## Summary

- What changed?
- Why was it needed?
- Which user flow or area of TalkFlow does it affect?

## Testing

- [ ] Backend tests: `cd backend && python3 -m unittest discover -s tests -v`
- [ ] Frontend lint: `cd frontend && npm run lint`
- [ ] Frontend build: `cd frontend && npm run build`
- [ ] Manual flow tested locally

## Manual Verification

- [ ] Auth flow
- [ ] Email verification or password reset flow if touched
- [ ] Chat or realtime flow if touched
- [ ] Upload flow if touched
- [ ] Profile/account flow if touched

## Environment / Config Changes

- [ ] No new env vars
- [ ] Added new env vars to `backend/.env.example`
- [ ] Added new env vars to `frontend/.env.example`
- [ ] Updated `README.md` if setup or behavior changed

## Deployment Notes

- [ ] No deployment impact
- [ ] Backend redeploy required
- [ ] Frontend redeploy required
- [ ] Data migration or manual production step required

## Checklist

- [ ] No real secrets, tokens, or keys were committed
- [ ] API contract changes are reflected in the frontend
- [ ] High-risk auth/encryption/email changes were reviewed carefully
