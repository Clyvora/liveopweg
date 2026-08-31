import postgres, { type Sql } from "postgres";
import type { RailJourney } from "../../packages/protocol/journey.js";
import type { RailObservation, RailTrackMatch } from "../../packages/protocol/rail.js";
import type { RoadEvent } from "../../packages/protocol/road.js";

export type PersistenceStatus = "DISABLED_CONFIG" | "CONNECTING" | "READY" | "DEGRADED" | "CLOSED";

export interface PersistenceHealth {
  status: PersistenceStatus;
  successfulWrites: number;
  failedWrites: number;
  lastSuccessfulWriteAt: string | null;
  lastError: string | null;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function point(longitude: number, latitude: number, elevationMeters = 0): string {
  return `POINT Z (${longitude} ${latitude} ${elevationMeters})`;
}

function point2d(position: { longitude: number; latitude: number } | null): string | null {
  return position ? `POINT (${position.longitude} ${position.latitude})` : null;
}

export function roadGeometryGeoJson(event: RoadEvent): string {
  return json(event.geometry);
}

export class PostgresHistoryStore {
  private status: PersistenceStatus = "CONNECTING";
  private successfulWrites = 0;
  private failedWrites = 0;
  private lastSuccessfulWriteAt: string | null = null;
  private lastError: string | null = null;

  private constructor(private readonly sql: Sql) {}

  static disabled(): PersistenceHealth {
    return {
      status: "DISABLED_CONFIG", successfulWrites: 0, failedWrites: 0,
      lastSuccessfulWriteAt: null, lastError: null,
    };
  }

  static async connect(url: string): Promise<PostgresHistoryStore> {
    const sql = postgres(url, {
      max: 6,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 30,
      connection: { application_name: "mobilityradar-realtime" },
    });
    const store = new PostgresHistoryStore(sql);
    await sql`SELECT 1`;
    store.status = "READY";
    return store;
  }

  health(): PersistenceHealth {
    return {
      status: this.status,
      successfulWrites: this.successfulWrites,
      failedWrites: this.failedWrites,
      lastSuccessfulWriteAt: this.lastSuccessfulWriteAt,
      lastError: this.lastError,
    };
  }

  private succeeded(): void {
    this.status = "READY";
    this.successfulWrites += 1;
    this.lastSuccessfulWriteAt = new Date().toISOString();
    this.lastError = null;
  }

  private failed(error: unknown): never {
    this.status = "DEGRADED";
    this.failedWrites += 1;
    this.lastError = error instanceof Error ? error.message : "unknown";
    throw error;
  }

  async writeRailBatch(observations: RailObservation[], matches: RailTrackMatch[]): Promise<void> {
    if (!observations.length) return;
    try {
      await this.sql.begin(async (sql) => {
        for (const observation of observations) {
          await sql`
            INSERT INTO rail_observation_versions (
              observation_id, vehicle_id, train_number, material_number, material_sequence,
              source_measured_at, received_at, normalized_at, measured_speed_kmh, heading_degrees,
              gps_hdop, gps_satellites, quality_state, payload_sha256, geom, normalized_payload
            ) VALUES (
              ${observation.observationId}, ${observation.vehicleId}, ${observation.trainNumber},
              ${observation.materialNumber}, ${observation.materialSequence}, ${observation.time.sourceMeasuredAt},
              ${observation.time.receivedAt}, ${observation.time.normalizedAt}, ${observation.speed?.valueKmh ?? null},
              ${observation.headingDegrees}, ${observation.gpsQuality.hdop}, ${observation.gpsQuality.satellites},
              ${observation.quality.state}, ${observation.provenance.payloadSha256},
              ST_GeomFromText(${point(observation.position.longitude, observation.position.latitude, observation.position.elevationMeters ?? 0)}, 4326),
              ${sql.json(observation)}
            ) ON CONFLICT (observation_id) DO NOTHING
          `;
        }
        for (const match of matches) {
          await sql`
            INSERT INTO rail_track_match_versions (
              observation_id, vehicle_id, status, confidence_class, graph_payload_sha256, matcher_method,
              edge_id, edge_progress, distance_meters, internal_score, source_measured_at, matched_at,
              raw_geom, matched_geom, normalized_payload
            ) VALUES (
              ${match.observationId}, ${match.vehicleId}, ${match.status}, ${match.confidenceClass},
              ${match.method.graphPayloadSha256}, ${`${match.method.id}@${match.method.version}`}, ${match.edgeId},
              ${match.edgeProgress}, ${match.distanceMeters}, ${match.internalScore}, ${match.sourceMeasuredAt},
              ${match.matchedAt}, ST_GeomFromText(${point2d(match.rawPosition)}, 4326),
              CASE WHEN ${point2d(match.snappedPosition)}::text IS NULL THEN NULL
                   ELSE ST_GeomFromText(${point2d(match.snappedPosition)}, 4326) END,
              ${sql.json(match)}
            ) ON CONFLICT (observation_id) DO NOTHING
          `;
        }
      });
      this.succeeded();
    } catch (error) {
      this.failed(error);
    }
  }

  async writeJourney(journey: RailJourney): Promise<void> {
    try {
      await this.sql`
        INSERT INTO rail_journey_versions (
          journey_id, train_number, service_date, operator, product_id, product_version,
          generated_at, information_at, valid_until, received_at, payload_sha256, normalized_payload
        ) VALUES (
          ${journey.journeyId}, ${journey.trainNumber}, ${journey.serviceDate}, ${journey.operator},
          ${journey.product.id}, ${journey.product.version}, ${journey.product.generatedAt},
          ${journey.product.informationAt}, ${journey.product.validUntil}, ${journey.provenance.receivedAt},
          ${journey.provenance.payloadSha256}, ${this.sql.json(journey)}
        ) ON CONFLICT DO NOTHING
      `;
      this.succeeded();
    } catch (error) {
      this.failed(error);
    }
  }

  async writeRoadEvents(events: RoadEvent[]): Promise<void> {
    if (!events.length) return;
    try {
      await this.sql.begin(async (sql) => {
        for (const event of events) {
          await sql`
            INSERT INTO road_event_versions (
              event_id, situation_id, source_record_id, source_version, event_type, detail_type,
              status, source_name, road_name, direction, description, severity, safety_related,
              delay_seconds, queue_length_meters, temporary_speed_limit_kmh, geom, publication_time,
              source_created_at, source_updated_at, valid_from, valid_until, received_at,
              payload_sha256, source_schema_version, quality_flags
            ) VALUES (
              ${event.id}, ${event.situationId}, ${event.sourceId}, ${event.version}, ${event.type},
              ${event.detailType}, ${event.status}, ${event.source}, ${event.roadName}, ${event.direction},
              ${event.description}, ${event.severity}, ${event.safetyRelated}, ${event.delaySeconds},
              ${event.queueLengthMeters}, ${event.temporarySpeedLimitKmh},
              ST_SetSRID(ST_GeomFromGeoJSON(${roadGeometryGeoJson(event)}), 4326), ${event.time.publicationTime},
              ${event.time.sourceCreatedAt}, ${event.time.sourceUpdatedAt}, ${event.time.validFrom},
              ${event.time.validUntil}, ${event.time.receivedAt}, ${event.provenance.payloadSha256},
              ${event.provenance.schemaVersion}, ${sql.json(event.qualityFlags)}
            ) ON CONFLICT DO NOTHING
          `;
        }
      });
      this.succeeded();
    } catch (error) {
      this.failed(error);
    }
  }

  async writeHealthSample(sourceId: string, status: string, ageSeconds: number | null, details: unknown): Promise<void> {
    try {
      await this.sql`
        INSERT INTO source_health_samples (sampled_at, source_id, status, age_seconds, details)
        VALUES (${new Date().toISOString()}, ${sourceId}, ${status}, ${ageSeconds}, ${json(details)}::jsonb)
      `;
      this.succeeded();
    } catch (error) {
      this.failed(error);
    }
  }

  async close(): Promise<void> {
    this.status = "CLOSED";
    await this.sql.end({ timeout: 5 });
  }
}
