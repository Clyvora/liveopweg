import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Subscriber } from "zeromq";
import { WebSocket, WebSocketServer } from "ws";
import type { JourneyRealtimeMessage } from "../../packages/protocol/journey.js";
import type { RoadRealtimeMessage } from "../../packages/protocol/road.js";
import {
  railClientMessageSchema,
  type RailFleetRealtimeMessage,
  type RailMatchRealtimeMessage,
  type RailObservation,
  type RailTrackMatch,
  type RailRealtimeMessage,
} from "../../packages/protocol/rail.js";
import { decodeJourney } from "../journey-ingestion/decode.js";
import { JourneyLiveState, localServiceDate } from "../journey-ingestion/live-state.js";
import { nsApiStatus } from "../journey-ingestion/ns-api.js";
import { RawJourneyStore } from "../journey-ingestion/raw-store.js";
import { RedisJourneyLiveState } from "../journey-ingestion/redis-live-state.js";
import { decodeRoadPublication } from "../road-ingestion/decode.js";
import { RoadLiveState } from "../road-ingestion/live-state.js";
import { RawRoadStore } from "../road-ingestion/raw-store.js";
import { RedisRoadLiveState } from "../road-ingestion/redis-live-state.js";
import { RuntimeMetrics } from "../observability/metrics.js";
import { PostgresHistoryStore, type PersistenceHealth } from "../persistence/postgres-history.js";
import { ReplayArchive } from "../replay/archive.js";
import type { GraphAudit } from "../rail-geometry/audit.js";
import type { TrackGraph } from "../rail-geometry/graph.js";
import { TrackMatchLiveStateStore } from "../rail-matching/live-state.js";
import { NationalTrackMatcher } from "../rail-matching/matcher.js";
import { decodeTrainPositions } from "./decode.js";
import { RailFleetLiveState } from "./fleet-live-state.js";
import { RailLiveState } from "./live-state.js";
import { RawRailStore } from "./raw-store.js";
import { RedisRailLiveState } from "./redis-live-state.js";

const endpoint = process.env.NDOV_ENDPOINT ?? "tcp://pubsub.besteffort.ndovloket.nl:7664";
const positionTopic = process.env.NDOV_POSITION_TOPIC ?? "/RIG/NStreinpositiesInterface5";
const journeyTopic = process.env.NDOV_JOURNEY_TOPIC ?? "/RIG/InfoPlusRITInterface5";
const ndwRoadUrl = process.env.NDW_ROAD_URL ?? "https://opendata.ndw.nu/actueel_beeld.xml.gz";
const configuredRoadPollSeconds = Number(process.env.NDW_ROAD_POLL_SECONDS ?? 60);
const roadPollSeconds = Number.isFinite(configuredRoadPollSeconds) ? Math.max(30, configuredRoadPollSeconds) : 60;
const port = Number(process.env.REALTIME_PORT ?? 8081);
const host = process.env.REALTIME_HOST ?? "127.0.0.1";
const corsAllowedOrigin = process.env.CORS_ALLOWED_ORIGIN ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
const requirePersistence = process.env.REQUIRE_PERSISTENCE === "true";
const freshnessThresholdSeconds = Number(process.env.FRESHNESS_THRESHOLD_SECONDS ?? 30);
const fleetRetentionSeconds = Number(process.env.FLEET_RETENTION_SECONDS ?? 300);
const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const rawStore = new RawRailStore(resolve(dataRoot, "raw", "rail"));
const rawJourneyStore = new RawJourneyStore(resolve(dataRoot, "raw", "rail-journey"));
const rawRoadStore = new RawRoadStore(resolve(dataRoot, "raw", "road", "ndw-actueel-beeld"));
const railGeometryPath = resolve(dataRoot, "rail-geometry", "track-geometry.geojson.gz");
const railGeometryManifestPath = resolve(dataRoot, "rail-geometry", "manifest.json");
const railGraphPath = resolve(dataRoot, "rail-geometry", "track-graph.json");
const railGraphAuditPath = resolve(dataRoot, "rail-geometry", "graph-audit.json");
const stationBundleDirectory = resolve(dataRoot, "station-bundles");
const stationBundleIds = new Set(["utrecht-centraal", "amsterdam-centraal", "rotterdam-centraal"]);
const liveState = new RailLiveState(
  resolve(dataRoot, "live", "tracked-rail-observation.json"),
  process.env.TRACKED_VEHICLE_ID,
);
const trackingPinned = Boolean(process.env.TRACKED_VEHICLE_ID);
const fleetState = new RailFleetLiveState(resolve(dataRoot, "live", "rail-fleet.json"), fleetRetentionSeconds);
const journeyState = new JourneyLiveState(resolve(dataRoot, "live", "journeys"));
const roadState = new RoadLiveState(resolve(dataRoot, "live", "road-events.json"));
const redisState = process.env.REDIS_URL
  ? await RedisRailLiveState.connect(process.env.REDIS_URL)
  : null;
const redisJourneyState = process.env.REDIS_URL
  ? await RedisJourneyLiveState.connect(process.env.REDIS_URL)
  : null;
const redisRoadState = process.env.REDIS_URL
  ? await RedisRoadLiveState.connect(process.env.REDIS_URL)
  : null;
const runtimeMetrics = new RuntimeMetrics();
let persistenceStartupHealth: PersistenceHealth = PostgresHistoryStore.disabled();
let postgresHistory: PostgresHistoryStore | null = null;
if (databaseUrl) {
  try {
    postgresHistory = await PostgresHistoryStore.connect(databaseUrl);
    persistenceStartupHealth = postgresHistory.health();
  } catch (error) {
    persistenceStartupHealth = {
      status: "DEGRADED",
      successfulWrites: 0,
      failedWrites: 1,
      lastSuccessfulWriteAt: null,
      lastError: error instanceof Error ? error.message : "unknown",
    };
    console.error(JSON.stringify({
      event: "postgis.connect.failed",
      reason: persistenceStartupHealth.lastError,
      required: requirePersistence,
    }));
    if (requirePersistence) throw error;
  }
}

let trackMatcher: NationalTrackMatcher | null = null;
let trackGraph: TrackGraph | null = null;
let graphAudit: GraphAudit | null = null;
try {
  const graph = JSON.parse(await readFile(railGraphPath, "utf8")) as TrackGraph;
  trackGraph = graph;
  try {
    graphAudit = JSON.parse(await readFile(railGraphAuditPath, "utf8")) as GraphAudit;
  } catch (error) {
    console.error(JSON.stringify({
      event: "rail.graph_audit.unavailable",
      reason: error instanceof Error ? error.message : "unknown",
    }));
  }
  trackMatcher = new NationalTrackMatcher(graph, graphAudit);
} catch (error) {
  console.error(JSON.stringify({
    event: "rail.matcher.unavailable",
    reason: error instanceof Error ? error.message : "unknown",
  }));
}
const trackMatches = new Map<string, RailTrackMatch>();
const trackMatchStore = new TrackMatchLiveStateStore(
  resolve(dataRoot, "live", "rail-track-matches.json"),
  "NETHERLANDS",
);
const replayArchive = new ReplayArchive(resolve(dataRoot, "raw", "rail"), trackGraph, graphAudit);

let sequence = 0;
let sourceHealth: "STARTING" | "HEALTHY" | "DEGRADED_SCHEMA" | "DISCONNECTED" = "STARTING";
let lastEnvelopeReceivedAt: string | null = null;
let journeySourceHealth: "STARTING" | "HEALTHY" | "DEGRADED_SCHEMA" | "DISCONNECTED" = "STARTING";
let lastJourneyEnvelopeReceivedAt: string | null = null;
let roadSequence = 0;
let roadSourceHealth: "STARTING" | "HEALTHY" | "DEGRADED_SCHEMA" | "DISCONNECTED" = "STARTING";
let lastRoadReceivedAt: string | null = null;
let lastRoadRejectedRecords = 0;
let roadEtag: string | null = null;

function observationFor(vehicleId: string | null): RailObservation | null {
  return vehicleId ? fleetState.get(vehicleId) : null;
}

function defaultVehicleId(): string | null {
  return liveState.tracked() ?? fleetState.snapshot()[0]?.vehicleId ?? null;
}

function snapshot(vehicleId = defaultVehicleId()): RailRealtimeMessage {
  return {
    protocolVersion: 1,
    type: "rail.vehicle.snapshot",
    sequence,
    sentAt: new Date().toISOString(),
    data: observationFor(vehicleId) ?? liveState.current(),
  };
}

function fleetSnapshot(): RailFleetRealtimeMessage {
  return {
    protocolVersion: 2,
    type: "rail.fleet.snapshot",
    sequence,
    sentAt: new Date().toISOString(),
    data: fleetState.snapshot(),
  };
}

function selectionSnapshot(vehicleId: string | null): RailFleetRealtimeMessage {
  return {
    protocolVersion: 2,
    type: "rail.selection.snapshot",
    sequence,
    sentAt: new Date().toISOString(),
    vehicleId,
    data: observationFor(vehicleId),
  };
}

function matchSnapshot(): RailMatchRealtimeMessage {
  return {
    protocolVersion: 1,
    type: "rail.match.snapshot",
    sequence,
    sentAt: new Date().toISOString(),
    region: "NETHERLANDS",
    data: Array.from(trackMatches.values()),
  };
}

function roadSnapshot(): RoadRealtimeMessage {
  return {
    protocolVersion: 1,
    type: "road.event.snapshot",
    sequence: roadSequence,
    sentAt: new Date().toISOString(),
    publicationTime: roadState.sourcePublicationTime(),
    data: roadState.snapshot(),
  };
}

function updateMatches(
  observations: RailObservation[],
  removedVehicleIds: string[],
): Extract<RailMatchRealtimeMessage, { type: "rail.match.batch" }> {
  const upserts: RailTrackMatch[] = [];
  const removed = new Set(removedVehicleIds);
  for (const vehicleId of removedVehicleIds) {
    trackMatcher?.remove(vehicleId);
    trackMatches.delete(vehicleId);
  }
  if (trackMatcher) {
    for (const observation of observations) {
      const match = trackMatcher.match(observation);
      if (match) {
        trackMatches.set(observation.vehicleId, match);
        upserts.push(match);
      } else if (trackMatches.delete(observation.vehicleId)) {
        trackMatcher.remove(observation.vehicleId);
        removed.add(observation.vehicleId);
      }
    }
  }
  void trackMatchStore.write(Array.from(trackMatches.values())).catch((error) => {
    console.error(JSON.stringify({
      event: "rail.matcher.state.write_failed",
      reason: error instanceof Error ? error.message : "unknown",
    }));
  });
  return {
    protocolVersion: 1,
    type: "rail.match.batch",
    sequence,
    sentAt: new Date().toISOString(),
    region: "NETHERLANDS",
    upserts,
    removedVehicleIds: Array.from(removed),
  };
}

function linkedJourney(vehicleId: string | null) {
  const observation = observationFor(vehicleId) ?? (vehicleId === defaultVehicleId() ? liveState.current() : null);
  if (!observation?.time.sourceMeasuredAt) return { data: null, link: null };
  const serviceDate = localServiceDate(observation.time.sourceMeasuredAt);
  return {
    data: journeyState.find(observation.trainNumber, serviceDate),
    link: {
      method: "TRAIN_NUMBER_AND_LOCAL_SERVICE_DATE" as const,
      origin: "DERIVED" as const,
      trainNumber: observation.trainNumber,
      serviceDate,
    },
  };
}

function journeySnapshot(vehicleId = defaultVehicleId()): JourneyRealtimeMessage {
  return {
    protocolVersion: 1,
    type: "rail.journey.snapshot",
    sequence,
    sentAt: new Date().toISOString(),
    ...linkedJourney(vehicleId),
  };
}

function writeJson(response: import("node:http").ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": corsAllowedOrigin,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(JSON.stringify(value));
}

async function persist(label: string, operation: (store: PostgresHistoryStore) => Promise<void>): Promise<void> {
  if (!postgresHistory) return;
  try {
    await operation(postgresHistory);
    runtimeMetrics.recordPersistenceWrite();
  } catch (error) {
    runtimeMetrics.recordPersistenceFailure();
    console.error(JSON.stringify({
      event: "postgis.write.failed",
      operation: label,
      reason: error instanceof Error ? error.message : "unknown",
    }));
  }
}

async function writeGeometryFile(
  response: import("node:http").ServerResponse,
  filePath: string,
  contentType: string,
  contentEncoding?: string,
  errorCodes: { missing: string; read: string } = {
    missing: "rail_geometry_not_imported",
    read: "rail_geometry_read_failed",
  },
) {
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentType,
      ...(contentEncoding ? { "content-encoding": contentEncoding } : {}),
      "access-control-allow-origin": "http://localhost:3000",
      "cache-control": "public, max-age=300",
      "content-length": body.length,
    });
    response.end(body);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return writeJson(response, 503, { error: errorCodes.missing });
    }
    return writeJson(response, 500, { error: errorCodes.read });
  }
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = requestUrl.pathname;
  if (path === "/v1/snapshot") return writeJson(response, 200, snapshot());
  if (path === "/v1/fleet") return writeJson(response, 200, fleetSnapshot());
  if (path === "/v1/journey") return writeJson(response, 200, journeySnapshot());
  if (path === "/v1/road/events") return writeJson(response, 200, roadSnapshot());
  if (path === "/v1/replay/catalog") {
    void replayArchive.catalog()
      .then((catalog) => writeJson(response, 200, catalog))
      .catch(() => writeJson(response, 500, { error: "replay_catalog_failed" }));
    return;
  }
  if (path === "/v1/replay/rail") {
    const vehicleId = requestUrl.searchParams.get("vehicleId");
    const from = new Date(requestUrl.searchParams.get("from") ?? "");
    const until = new Date(requestUrl.searchParams.get("until") ?? "");
    if (!vehicleId || Number.isNaN(from.valueOf()) || Number.isNaN(until.valueOf())) {
      return writeJson(response, 400, { error: "vehicleId_from_until_required" });
    }
    void replayArchive.sequence(vehicleId, from, until)
      .then((sequence) => writeJson(response, 200, sequence))
      .catch((error) => writeJson(response, 400, {
        error: "replay_request_rejected",
        reason: error instanceof Error ? error.message : "unknown",
      }));
    return;
  }
  if (path === "/v1/matches/rail" || path === "/v1/matches/utrecht") return writeJson(response, 200, matchSnapshot());
  if (path === "/v1/geometry/rail") {
    void writeGeometryFile(response, railGeometryPath, "application/geo+json", "gzip");
    return;
  }
  if (path === "/v1/geometry/rail/meta") {
    void writeGeometryFile(response, railGeometryManifestPath, "application/json; charset=utf-8");
    return;
  }
  if (path === "/v1/geometry/rail/audit") {
    void writeGeometryFile(response, railGraphAuditPath, "application/json; charset=utf-8");
    return;
  }
  const stationMatch = path.match(/^\/v1\/stations\/([a-z-]+)\/3d$/);
  if (stationMatch && stationBundleIds.has(stationMatch[1])) {
    void writeGeometryFile(response, resolve(stationBundleDirectory, `${stationMatch[1]}.json`), "application/json; charset=utf-8", undefined, {
      missing: "station_bundle_not_built",
      read: "station_bundle_read_failed",
    });
    return;
  }
  if (path === "/health") return writeJson(response, 200, {
    status: sourceHealth,
    sources: {
      positions: { status: sourceHealth, source: "ndov.ns.train-positions.interface-5", lastEnvelopeReceivedAt },
      journeys: { status: journeySourceHealth, source: "ndov.infoplus.rit.interface-5", lastEnvelopeReceivedAt: lastJourneyEnvelopeReceivedAt },
      ndwActueelBeeld: {
        status: roadSourceHealth,
        source: "ndw.datex3.actueel-beeld",
        endpoint: ndwRoadUrl,
        lastReceivedAt: lastRoadReceivedAt,
        publicationTime: roadState.sourcePublicationTime(),
        activeEvents: roadState.snapshot().length,
        rejectedRecords: lastRoadRejectedRecords,
        pollSeconds: roadPollSeconds,
      },
      replay: {
        status: trackGraph ? "READY" : "DEGRADED_GRAPH_UNAVAILABLE",
        source: "stored-raw-rail-payloads",
        maximumWindowSeconds: 7_200,
        matchOrigin: trackGraph ? "RECOMPUTED_WITH_PINNED_GRAPH" : "GRAPH_UNAVAILABLE",
      },
      persistence: postgresHistory?.health() ?? persistenceStartupHealth,
      nsApi: { status: nsApiStatus() },
      railGeometry: {
        status: existsSync(railGeometryPath) && existsSync(railGeometryManifestPath) ? "READY" : "NOT_IMPORTED",
        source: "pdok.prorail.spoorwegen",
      },
      railGraphAudit: {
        status: graphAudit ? "READY" : "NOT_AVAILABLE",
        method: graphAudit?.method ?? null,
        stats: graphAudit?.stats ?? null,
      },
      station3d: {
        status: Array.from(stationBundleIds).every((id) => existsSync(resolve(stationBundleDirectory, `${id}.json`))) ? "READY" : "PARTIAL",
        stations: Array.from(stationBundleIds).filter((id) => existsSync(resolve(stationBundleDirectory, `${id}.json`))),
        source: "prorail-pdok+bgt-pdok+pdok-3d",
      },
      nationalTrackMatcher: {
        status: trackMatcher ? (graphAudit ? "READY" : "DEGRADED_AUDIT") : "GRAPH_UNAVAILABLE",
        method: "national-track-matcher@2.0.0",
        activeMatches: trackMatches.size,
      },
    },
    fleet: { vehicles: fleetState.snapshot().length, retentionSeconds: fleetRetentionSeconds },
    trackedObservation: snapshot().data?.observationId ?? null,
  });
  if (path === "/metrics") {
    response.writeHead(200, {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(runtimeMetrics.render());
    return;
  }
  return writeJson(response, 404, { error: "not_found" });
});

const sockets = new WebSocketServer({ server, path: "/v1/realtime", maxPayload: 8_192 });
const clientSelections = new WeakMap<WebSocket, string | null>();

function send(socket: WebSocket, message: RailFleetRealtimeMessage | RailMatchRealtimeMessage | JourneyRealtimeMessage | RoadRealtimeMessage) {
  if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 4_000_000) {
    socket.send(JSON.stringify(message));
  }
}

function sendSelectedContext(socket: WebSocket) {
  const vehicleId = clientSelections.get(socket) ?? defaultVehicleId();
  send(socket, selectionSnapshot(vehicleId));
  send(socket, journeySnapshot(vehicleId));
}

sockets.on("connection", (socket) => {
  runtimeMetrics.setWebsocketClients(sockets.clients.size);
  clientSelections.set(socket, defaultVehicleId());
  send(socket, fleetSnapshot());
  send(socket, matchSnapshot());
  send(socket, roadSnapshot());
  sendSelectedContext(socket);
  socket.on("message", (message) => {
    let decoded: unknown;
    try { decoded = JSON.parse(message.toString()); } catch { return; }
    const parsed = railClientMessageSchema.safeParse(decoded);
    if (!parsed.success) return;
    if (parsed.data.type === "resync") {
      send(socket, fleetSnapshot());
      send(socket, matchSnapshot());
      send(socket, roadSnapshot());
      sendSelectedContext(socket);
      return;
    }
    if (!fleetState.get(parsed.data.vehicleId)) return;
    clientSelections.set(socket, parsed.data.vehicleId);
    sendSelectedContext(socket);
  });
  socket.on("close", () => runtimeMetrics.setWebsocketClients(sockets.clients.size));
});

function broadcastFleet(message: RailFleetRealtimeMessage) {
  for (const client of sockets.clients) send(client, message);
}

function broadcastMatches(message: RailMatchRealtimeMessage) {
  for (const client of sockets.clients) send(client, message);
}

function broadcastRoad(message: RoadRealtimeMessage) {
  for (const client of sockets.clients) send(client, message);
}

function broadcastSelectedContexts() {
  for (const client of sockets.clients) sendSelectedContext(client);
}

function hasJourney(observation: RailObservation | null): boolean {
  return Boolean(observation?.time.sourceMeasuredAt
    && journeyState.find(observation.trainNumber, localServiceDate(observation.time.sourceMeasuredAt)));
}

async function consume(): Promise<void> {
  const socket = new Subscriber({ receiveHighWaterMark: 100 });
  socket.connect(endpoint);
  socket.subscribe(positionTopic);
  console.log(JSON.stringify({ event: "ndov.subscribed", endpoint, topic: positionTopic }));

  try {
    for await (const frames of socket) {
      if (frames.length < 2 || frames[0].toString("utf8") !== positionTopic) continue;
      const receivedAt = new Date().toISOString();
      lastEnvelopeReceivedAt = receivedAt;
      const rawRecord = await rawStore.append(positionTopic, endpoint, receivedAt, frames[1]);
      try {
        const observations = decodeTrainPositions(frames[1], {
          receivedAt,
          payloadSha256: rawRecord.payloadSha256,
          freshnessThresholdSeconds,
        });
        const fleetResult = await fleetState.applyBatch(observations, new Date(receivedAt));
        sourceHealth = "HEALTHY";

        if (!trackingPinned && !hasJourney(observationFor(defaultVehicleId()))) {
          const enrichedCandidate = fleetState.snapshot(new Date(receivedAt)).find(hasJourney);
          const candidate = enrichedCandidate ?? fleetResult.accepted[0];
          if (candidate) liveState.follow(candidate.vehicleId);
        }
        const defaultObservation = observationFor(defaultVehicleId());
        if (defaultObservation) await liveState.apply(defaultObservation);
        await redisState?.writeBatch(fleetResult.accepted, defaultVehicleId());

        if (fleetResult.accepted.length || fleetResult.removedVehicleIds.length) {
          sequence += 1;
          const matches = updateMatches(fleetResult.accepted, fleetResult.removedVehicleIds);
          await persist("rail_batch", (store) => store.writeRailBatch(fleetResult.accepted, matches.upserts));
          broadcastFleet({
            protocolVersion: 2,
            type: "rail.fleet.batch",
            sequence,
            sentAt: new Date().toISOString(),
            upserts: fleetResult.accepted,
            removedVehicleIds: fleetResult.removedVehicleIds,
          });
          broadcastMatches(matches);
          broadcastSelectedContexts();
        }
        runtimeMetrics.recordRailBatch({
          observations: observations.length,
          duplicates: fleetResult.duplicates,
          outOfOrder: fleetResult.outOfOrder,
          newestSourceMeasuredAt: observations.map((item) => item.time.sourceMeasuredAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
        });
        console.log(JSON.stringify({
          event: "rail.fleet.batch.accepted",
          received: observations.length,
          accepted: fleetResult.accepted.length,
          duplicates: fleetResult.duplicates,
          outOfOrder: fleetResult.outOfOrder,
          removed: fleetResult.removedVehicleIds.length,
          active: fleetState.snapshot(new Date(receivedAt)).length,
          payloadSha256: rawRecord.payloadSha256,
        }));
      } catch (error) {
        sourceHealth = "DEGRADED_SCHEMA";
        console.error(JSON.stringify({
          event: "rail.message.quarantined",
          payloadSha256: rawRecord.payloadSha256,
          reason: error instanceof Error ? error.message : "unknown",
        }));
      }
    }
  } finally {
    sourceHealth = "DISCONNECTED";
    socket.close();
  }
}

async function consumeJourneys(): Promise<void> {
  const socket = new Subscriber({ receiveHighWaterMark: 1_000 });
  socket.connect(endpoint);
  socket.subscribe(journeyTopic);
  console.log(JSON.stringify({ event: "ndov.subscribed", endpoint, topic: journeyTopic }));

  try {
    for await (const frames of socket) {
      if (frames.length < 2 || frames[0].toString("utf8") !== journeyTopic) continue;
      const receivedAt = new Date().toISOString();
      lastJourneyEnvelopeReceivedAt = receivedAt;
      const rawRecord = await rawJourneyStore.append(journeyTopic, endpoint, receivedAt, frames[1]);
      try {
        const journey = decodeJourney(frames[1], { receivedAt, payloadSha256: rawRecord.payloadSha256 });
        const result = await journeyState.apply(journey);
        journeySourceHealth = "HEALTHY";
        if (result !== "accepted") continue;
        await redisJourneyState?.write(journey);
        await persist("journey", (store) => store.writeJourney(journey));
        runtimeMetrics.recordJourney();
        for (const client of sockets.clients) {
          const vehicleId = clientSelections.get(client) ?? defaultVehicleId();
          const linked = linkedJourney(vehicleId);
          if (linked.data?.journeyId === journey.journeyId) send(client, journeySnapshot(vehicleId));
        }
      } catch (error) {
        journeySourceHealth = "DEGRADED_SCHEMA";
        console.error(JSON.stringify({
          event: "rail.journey.quarantined", payloadSha256: rawRecord.payloadSha256,
          reason: error instanceof Error ? error.message : "unknown",
        }));
      }
    }
  } finally {
    journeySourceHealth = "DISCONNECTED";
    socket.close();
  }
}

async function pollRoadOnce(): Promise<void> {
  const headers = new Headers({ accept: "application/xml, application/gzip", "cache-control": "no-cache" });
  if (roadEtag) headers.set("if-none-match", roadEtag);
  let response: Response;
  try {
    response = await fetch(ndwRoadUrl, { headers, signal: AbortSignal.timeout(25_000) });
  } catch (error) {
    roadSourceHealth = "DISCONNECTED";
    throw error;
  }
  if (response.status === 304) {
    roadSourceHealth = "HEALTHY";
    const removedEventIds = await roadState.prune();
    if (removedEventIds.length && roadState.sourcePublicationTime()) {
      roadSequence += 1;
      broadcastRoad({
        protocolVersion: 1,
        type: "road.event.batch",
        sequence: roadSequence,
        sentAt: new Date().toISOString(),
        publicationTime: roadState.sourcePublicationTime()!,
        upserts: [],
        removedEventIds,
      });
    }
    return;
  }
  if (!response.ok) {
    roadSourceHealth = "DISCONNECTED";
    throw new Error(`NDW Actueel Beeld antwoordde met HTTP ${response.status}`);
  }
  const receivedAt = new Date().toISOString();
  const payload = Buffer.from(await response.arrayBuffer());
  const rawRecord = await rawRoadStore.append(ndwRoadUrl, receivedAt, payload);
  try {
    const publication = decodeRoadPublication(payload, {
      receivedAt,
      payloadSha256: rawRecord.payloadSha256,
      sourceUrl: ndwRoadUrl,
    });
    const applied = await roadState.applySnapshot(publication.events, publication.publicationTime, new Date(receivedAt));
    await redisRoadState?.writeSnapshot(applied.upserts, applied.removedEventIds, publication.publicationTime);
    await persist("road_events", (store) => store.writeRoadEvents(applied.upserts));
    roadEtag = response.headers.get("etag");
    lastRoadReceivedAt = receivedAt;
    lastRoadRejectedRecords = publication.rejected.length;
    roadSourceHealth = "HEALTHY";
    runtimeMetrics.recordRoadPoll(roadState.snapshot(new Date(receivedAt)).length);
    roadSequence += 1;
    broadcastRoad({
      protocolVersion: 1,
      type: "road.event.batch",
      sequence: roadSequence,
      sentAt: new Date().toISOString(),
      publicationTime: publication.publicationTime,
      upserts: applied.upserts,
      removedEventIds: applied.removedEventIds,
    });
    console.log(JSON.stringify({
      event: "road.ndw.snapshot.accepted",
      publicationTime: publication.publicationTime,
      records: publication.events.length,
      rejected: publication.rejected.length,
      duplicates: applied.duplicates,
      removed: applied.removedEventIds.length,
      active: roadState.snapshot(new Date(receivedAt)).length,
      payloadSha256: rawRecord.payloadSha256,
    }));
  } catch (error) {
    roadSourceHealth = "DEGRADED_SCHEMA";
    console.error(JSON.stringify({
      event: "road.ndw.snapshot.quarantined",
      payloadSha256: rawRecord.payloadSha256,
      reason: error instanceof Error ? error.message : "unknown",
    }));
  }
}

async function pollRoad(): Promise<void> {
  await pollRoadOnce().catch((error) => {
    console.error(JSON.stringify({ event: "road.ndw.poll.failed", reason: error instanceof Error ? error.message : "unknown" }));
  });
  setInterval(() => {
    void pollRoadOnce().catch((error) => {
      console.error(JSON.stringify({ event: "road.ndw.poll.failed", reason: error instanceof Error ? error.message : "unknown" }));
    });
  }, roadPollSeconds * 1_000).unref();
}

await liveState.restore();
await fleetState.restore();
await journeyState.restore();
await roadState.restore();
const restoredFleet = fleetState.snapshot();
const activeVehicleIds = new Set(restoredFleet.map((observation) => observation.vehicleId));
for (const match of await trackMatchStore.restore()) {
  if (activeVehicleIds.has(match.vehicleId)) trackMatches.set(match.vehicleId, match);
}
if (trackMatcher) updateMatches(restoredFleet, []);
server.listen(port, host, () => {
  console.log(JSON.stringify({ event: "realtime.listening", url: `http://${host}:${port}` }));
});

consume().catch((error) => {
  sourceHealth = "DISCONNECTED";
  console.error(JSON.stringify({ event: "ndov.consumer.failed", reason: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
});
consumeJourneys().catch((error) => {
  journeySourceHealth = "DISCONNECTED";
  console.error(JSON.stringify({ event: "ndov.journey-consumer.failed", reason: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
});
void pollRoad();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void Promise.all([redisState?.close(), redisJourneyState?.close(), redisRoadState?.close(), postgresHistory?.close()]).finally(() => server.close());
  });
}
