# MCEO Event Check-In — Phase 1

A mobile-friendly QR attendance web app for events.

## Features
- Create/select event
- Dashboard attendance stats
- Import attendees from Excel/CSV
- Generate unique QR values
- QR scan check-in
- Manual search check-in
- Walk-in registration
- Export attendance report

## Setup
1. Create a Supabase project.
2. Run `supabase-schema.sql` in Supabase SQL Editor.
3. Copy `.env.example` to `.env` and fill in your Supabase URL and anon key.
4. Run:

```bash
npm install
npm run dev
```

## Excel Import Columns
Required: `name`
Optional: `phone`, `email`, `team`, `category`

