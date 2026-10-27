# AI Smart Attendance System with Facial Recognition

A modern, high-precision biometric attendance solution built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, and **Supabase (pgvector)**. 

Featuring client-side neural face detection with **@vladmandic/face-api**, **Eye Aspect Ratio (EAR) anti-spoofing blink verification**, and sub-500ms 128-dimensional vector cosine similarity matching.

---

## Key Features

- **Continuous Kiosk Mode**: 500ms detection loop with instant green HUD check-in confirmation and soft Web Audio chimes.
- **Anti-Spoofing Liveness Detection**: Real-time Eye Aspect Ratio (EAR) calculated from 68 facial landmarks requires a natural eye blink before granting attendance (blocks photos, tablets, and printed spoofs).
- **Client-Side Face Processing**: Face embeddings (128-d vectors) are computed entirely in the browser; raw video is never uploaded or transmitted over the wire.
- **Supabase pgvector Similarity**: Matches query face embeddings using PostgreSQL Euclidean/cosine distance operators `<->` via a high-performance stored procedure (`match_face`).
- **Interactive Setup Wizard (`/setup`)**: Live connection testing, schema verification checklist, one-click schema copy, storage bucket creation, and sample data generator.
- **Comprehensive Reporting**: Multi-filter attendance logs (by date range, department, or individual), per-person attendance percentage tracking, and one-click CSV export.
- **People & Identity Directory**: Full CRUD management with biometric status badges (Enrolled vs Needs Scan).

---

## Database Schema (Supabase SQL)

Run the following SQL script in your **Supabase Dashboard > SQL Editor**:

```sql
-- 1. Enable pgvector extension for 128-dimensional facial embedding search
create extension if not exists vector;

-- 2. Profiles table for authenticated users / admins
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text default 'admin'
);

-- 3. People table (students / employees) with 128-d face descriptor vector
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  roll_no text unique not null,
  department text,
  photo_url text,
  face_descriptor vector(128),
  created_at timestamptz default now()
);

-- 4. Attendance logs (one check-in per person per calendar date)
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  date date default current_date,
  check_in timestamptz default now(),
  confidence float,
  unique (person_id, date)
);

-- 5. Cosine / Euclidean distance vector similarity matching function
create or replace function match_face(query_embedding vector(128), threshold float default 0.5)
returns table (id uuid, full_name text, roll_no text, distance float)
language sql stable as $$
  select
    id,
    full_name,
    roll_no,
    (face_descriptor <-> query_embedding) as distance
  from people
  where face_descriptor is not null and (face_descriptor <-> query_embedding) < threshold
  order by face_descriptor <-> query_embedding
  limit 1;
$$;

-- 6. Row Level Security
alter table people enable row level security;
alter table attendance enable row level security;
alter table profiles enable row level security;

-- 7. RLS Policies
create policy "auth people" on people for all to authenticated using (true) with check (true);
create policy "auth attendance" on attendance for all to authenticated using (true) with check (true);
create policy "own profile" on profiles for all to authenticated using (auth.uid() = id);

-- 8. Policies for Kiosk mode and client access
create policy "kiosk read people" on people for select using (true);
create policy "kiosk insert people" on people for insert with check (true);
create policy "kiosk update people" on people for update using (true);
create policy "kiosk delete people" on people for delete using (true);
create policy "kiosk read attendance" on attendance for select using (true);
create policy "kiosk insert attendance" on attendance for insert with check (true);
create policy "kiosk delete attendance" on attendance for delete using (true);
```

---

## Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Project Credentials (obtain from Supabase Dashboard > Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

> **Security Note**: Never input or commit the secret `service_role` key. The browser and kiosk strictly use the public `anon` key combined with Supabase Row Level Security.

---

## Face Recognition Models

The neural network weights (`TinyFaceDetector`, `FaceLandmark68Net`, and `FaceRecognitionNet`) are stored in `/public/models/`.

If setting up the repository from scratch, download the models by running:

```bash
npm run download-models
```

---

## Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Download neural face models**:
   ```bash
   npm run download-models
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser. If Supabase is not yet configured, visit `/setup` to paste your project URL and anon key.

---

## Deploy to Vercel

1. Push your repository to GitHub.
2. Import the project into [Vercel](https://vercel.com).
3. Set the environment variables in Vercel Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. The models in `/public/models/` will be deployed automatically with your static assets.
5. Deploy!

---

## Project Structure

```
├── app/
│   ├── attendance/        # Kiosk mode full-screen scanner & anti-spoofing
│   ├── dashboard/         # Stat metrics, 7-day trend chart, recent logs
│   ├── enroll/            # 5-sample face enrollment & descriptor averaging
│   ├── login/             # Email/password authentication & demo mode
│   ├── people/            # Directory management (CRUD)
│   ├── reports/           # Date & department filters, CSV export
│   ├── setup/             # Supabase connection wizard & schema checklist
│   ├── globals.css        # Tailwind styles & theme variables
│   ├── layout.tsx         # Root layout with ToastProvider
│   └── page.tsx           # Home landing page
├── components/
│   ├── FaceCanvasOverlay.tsx # Biometric bounding box, EAR & HUD overlay
│   ├── Navbar.tsx            # Navigation header & Supabase connection pill
│   └── Toast.tsx             # Notification toast alerts
├── hooks/
│   ├── useCamera.ts       # Webcam stream, resolution & capture
│   ├── useFaceApi.ts      # Model loading, EAR calculation, descriptors
│   ├── useSupabase.ts     # Supabase client, schema diagnostics, session
│   └── useTheme.ts        # Dark/light theme toggler
├── lib/
│   ├── sound.ts           # Web Audio API chime & warning audio synth
│   └── supabase/          # Client & server Supabase SSR factories
└── public/models/         # Pre-trained face-api neural network weights
```
