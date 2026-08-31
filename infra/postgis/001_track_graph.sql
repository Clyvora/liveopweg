CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS track_geometry_versions (
  id text PRIMARY KEY,
  source_id text NOT NULL,
  source_url text NOT NULL,
  source_updated_at timestamptz,
  imported_at timestamptz NOT NULL,
  payload_sha256 char(64) NOT NULL,
  license_id text NOT NULL,
  edge_count integer NOT NULL,
  node_count integer NOT NULL
);

CREATE TABLE IF NOT EXISTS track_nodes (
  id text PRIMARY KEY,
  geometry_version_id text NOT NULL REFERENCES track_geometry_versions(id),
  kind text NOT NULL,
  degree integer NOT NULL,
  geom geometry(Point, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS track_edges (
  id text PRIMARY KEY,
  geometry_version_id text NOT NULL REFERENCES track_geometry_versions(id),
  from_node_id text NOT NULL REFERENCES track_nodes(id),
  to_node_id text NOT NULL REFERENCES track_nodes(id),
  source_puic text,
  name text,
  lifecycle_status text,
  source_published_at timestamptz,
  length_meters double precision NOT NULL,
  directionality text NOT NULL DEFAULT 'unknown',
  inferred boolean NOT NULL DEFAULT false,
  geom geometry(LineString, 4326)
);

CREATE INDEX IF NOT EXISTS track_nodes_geom_gist ON track_nodes USING GIST (geom);
CREATE INDEX IF NOT EXISTS track_edges_geom_gist ON track_edges USING GIST (geom);
CREATE INDEX IF NOT EXISTS track_edges_from_node_btree ON track_edges (from_node_id);
CREATE INDEX IF NOT EXISTS track_edges_to_node_btree ON track_edges (to_node_id);
CREATE INDEX IF NOT EXISTS track_edges_version_btree ON track_edges (geometry_version_id);
CREATE INDEX IF NOT EXISTS track_edges_source_puic_btree ON track_edges (source_puic);
