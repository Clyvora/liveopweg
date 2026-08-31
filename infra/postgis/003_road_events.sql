CREATE TABLE IF NOT EXISTS road_event_versions (
  event_id text NOT NULL,
  situation_id text NOT NULL,
  source_record_id text NOT NULL,
  source_version integer NOT NULL,
  event_type text NOT NULL,
  detail_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'PLANNED', 'STALE', 'ENDED')),
  source_name text NOT NULL,
  road_name text,
  direction text,
  description text,
  severity text NOT NULL,
  safety_related boolean NOT NULL,
  delay_seconds double precision,
  queue_length_meters double precision,
  temporary_speed_limit_kmh double precision,
  geom geometry(Geometry, 4326) NOT NULL,
  publication_time timestamptz NOT NULL,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  received_at timestamptz NOT NULL,
  payload_sha256 char(64) NOT NULL,
  source_schema_version text NOT NULL,
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, source_version, payload_sha256)
);

CREATE INDEX IF NOT EXISTS road_event_versions_geom_gist ON road_event_versions USING GIST (geom);
CREATE INDEX IF NOT EXISTS road_event_versions_validity_btree ON road_event_versions (valid_from, valid_until);
CREATE INDEX IF NOT EXISTS road_event_versions_type_status_btree ON road_event_versions (event_type, status);
CREATE INDEX IF NOT EXISTS road_event_versions_publication_brin ON road_event_versions USING BRIN (publication_time);
