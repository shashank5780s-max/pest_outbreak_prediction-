-- ============================================================
-- Migration 001 — Initial Schema
-- AgriPredict pest prediction history table
-- ============================================================
-- Run this in the Supabase SQL Editor or via psql.
-- Users are managed by Supabase Auth (auth.users table is auto-created).
-- ============================================================

-- Pest predictions history table
CREATE TABLE IF NOT EXISTS pest_predictions_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    weather     JSONB NOT NULL,
    prediction  JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast per-user chronological queries
CREATE INDEX IF NOT EXISTS idx_predictions_user_created
    ON pest_predictions_history (user_id, created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Users can only read and insert their own records.
ALTER TABLE pest_predictions_history ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own predictions
CREATE POLICY "users_insert_own_predictions"
    ON pest_predictions_history
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Allow users to read only their own predictions
CREATE POLICY "users_select_own_predictions"
    ON pest_predictions_history
    FOR SELECT
    USING (auth.uid() = user_id);

-- ── Public access for demo (remove/restrict in full auth implementation) ──────
-- Allows the 'public' user_id (used before auth is enforced) to be inserted.
-- Remove this policy once Phase 3 auth is fully deployed.
CREATE POLICY "allow_public_user_insert"
    ON pest_predictions_history
    FOR INSERT
    WITH CHECK (user_id::text = 'public');

-- ============================================================
-- Migration 002 (future) — Add fields/locations table
-- ============================================================
-- CREATE TABLE IF NOT EXISTS fields (
--     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
--     name        TEXT NOT NULL,
--     lat         DOUBLE PRECISION NOT NULL,
--     lng         DOUBLE PRECISION NOT NULL,
--     crop        TEXT,
--     notes       TEXT,
--     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
