CREATE TABLE IF NOT EXISTS rail_observation_versions (
  observation_id text PRIMARY KEY,
  vehicle_id text NOT NULL,
  train_number text NOT NULL,
  material_number text,
  material_sequence text,
  source_measured_at timestamptz,
  received_at timestamptz NOT NULL,
  normalized_at timestamptz NOT NULL,
  measured_speed_kmh double precision,
  heading_degrees double precision,
  gps_hdop double precision,
  gps_satellites integer,
  quality_state text NOT NULL,
  payload_sha256 char(64) NOT NULL,
  geom geometry(PointZ, 4326) NOT NULL,
  normalized_payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rail_observation_versions_geom_gist ON rail_observation_versions USING GIST (geom);
CREATE INDEX IF NOT EXISTS rail_observation_versions_vehicle_time_btree
  ON rail_observation_versions (vehicle_id, source_measured_at DESC);
CREATE INDEX IF NOT EXISTS rail_observation_versions_received_brin
  ON rail_observation_versions USING BRIN (received_at);

CREATE TABLE IF NOT EXISTS rail_track_match_versions (
  observation_id text PRIMARY KEY REFERENCES rail_observation_versions(observation_id) ON DELETE CASCADE,
  vehicle_id text NOT NULL,
  status text NOT NULL,
  confidence_class text NOT NULL,
  graph_payload_sha256 char(64) NOT NULL,
  matcher_method text NOT NULL,
  edge_id text,
  edge_progress double precision,
  distance_meters double precision,
  internal_score double precision,
  score_is_probability boolean NOT NULL DEFAULT false CHECK (score_is_probability = false),
  source_measured_at timestamptz,
  matched_at timestamptz NOT NULL,
  raw_geom geometry(Point, 4326) NOT NULL,
  matched_geom geometry(Point, 4326),
  normalized_payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rail_track_match_versions_raw_geom_gist ON rail_track_match_versions USING GIST (raw_geom);
CREATE INDEX IF NOT EXISTS rail_track_match_versions_matched_geom_gist ON rail_track_match_versions USING GIST (matched_geom);
CREATE INDEX IF NOT EXISTS rail_track_match_versions_vehicle_time_btree
  ON rail_track_match_versions (vehicle_id, source_measured_at DESC);

CREATE TABLE IF NOT EXISTS rail_journey_versions (
  journey_id text NOT NULL,
  train_number text NOT NULL,
  service_date date NOT NULL,
  operator text,
  product_id text NOT NULL,
  product_version text,
  generated_at timestamptz NOT NULL,
  information_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  payload_sha256 char(64) NOT NULL,
  normalized_payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (journey_id, product_id, generated_at, payload_sha256)
);

CREATE INDEX IF NOT EXISTS rail_journey_versions_train_date_btree
  ON rail_journey_versions (train_number, service_date, information_at DESC);
CREATE INDEX IF NOT EXISTS rail_journey_versions_received_brin
  ON rail_journey_versions USING BRIN (received_at);

CREATE TABLE IF NOT EXISTS source_health_samples (
  sampled_at timestamptz NOT NULL,
  source_id text NOT NULL,
  status text NOT NULL,
  age_seconds double precision,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (sampled_at, source_id)
);

CREATE INDEX IF NOT EXISTS source_health_samples_time_brin ON source_health_samples USING BRIN (sampled_at);
