CREATE TABLE IF NOT EXISTS rail_track_matches (
  observation_id text PRIMARY KEY,
  vehicle_id text NOT NULL,
  region text NOT NULL CHECK (region IN ('UTRECHT_PILOT', 'NETHERLANDS')),
  geometry_version_id text NOT NULL REFERENCES track_geometry_versions(id),
  edge_id text REFERENCES track_edges(id),
  status text NOT NULL,
  confidence_class text NOT NULL,
  internal_score double precision,
  score_is_probability boolean NOT NULL DEFAULT false CHECK (score_is_probability = false),
  runner_up_gap double precision,
  distance_meters double precision,
  edge_progress double precision,
  candidate_count integer NOT NULL,
  search_radius_meters double precision NOT NULL,
  zone_id text,
  zone_quality text,
  regional_fallback boolean NOT NULL DEFAULT false,
  fallback_reason text,
  raw_geom geometry(Point, 4326) NOT NULL,
  matched_geom geometry(Point, 4326),
  candidate_debug jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_measured_at timestamptz,
  matched_at timestamptz NOT NULL,
  method_id text NOT NULL,
  method_version text NOT NULL
);

CREATE INDEX IF NOT EXISTS rail_track_matches_raw_geom_gist ON rail_track_matches USING GIST (raw_geom);
CREATE INDEX IF NOT EXISTS rail_track_matches_matched_geom_gist ON rail_track_matches USING GIST (matched_geom);
CREATE INDEX IF NOT EXISTS rail_track_matches_vehicle_time_btree ON rail_track_matches (vehicle_id, source_measured_at DESC);
CREATE INDEX IF NOT EXISTS rail_track_matches_edge_btree ON rail_track_matches (edge_id);
CREATE INDEX IF NOT EXISTS rail_track_matches_status_btree ON rail_track_matches (status);
