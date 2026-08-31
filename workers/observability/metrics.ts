function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function metric(name: string, type: "counter" | "gauge", help: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name} ${finite(value)}\n`;
}

export class RuntimeMetrics {
  private startedAt = Date.now();
  private railMessages = 0;
  private railObservations = 0;
  private railDuplicates = 0;
  private railOutOfOrder = 0;
  private railPositionAgeSeconds = 0;
  private journeyMessages = 0;
  private roadPolls = 0;
  private roadEvents = 0;
  private websocketClients = 0;
  private persistenceFailures = 0;
  private persistenceWrites = 0;

  recordRailBatch(input: {
    observations: number;
    duplicates: number;
    outOfOrder: number;
    newestSourceMeasuredAt: string | null;
  }): void {
    this.railMessages += 1;
    this.railObservations += input.observations;
    this.railDuplicates += input.duplicates;
    this.railOutOfOrder += input.outOfOrder;
    if (input.newestSourceMeasuredAt) {
      this.railPositionAgeSeconds = Math.max(0, (Date.now() - Date.parse(input.newestSourceMeasuredAt)) / 1_000);
    }
  }

  recordJourney(): void { this.journeyMessages += 1; }
  recordRoadPoll(events: number): void { this.roadPolls += 1; this.roadEvents = events; }
  setWebsocketClients(value: number): void { this.websocketClients = Math.max(0, value); }
  recordPersistenceWrite(): void { this.persistenceWrites += 1; }
  recordPersistenceFailure(): void { this.persistenceFailures += 1; }

  render(): string {
    return [
      metric("mobilityradar_process_uptime_seconds", "gauge", "Seconds since the realtime gateway started.", (Date.now() - this.startedAt) / 1_000),
      metric("mobilityradar_rail_source_messages_total", "counter", "Accepted rail source envelopes.", this.railMessages),
      metric("mobilityradar_rail_observations_total", "counter", "Normalized rail observations.", this.railObservations),
      metric("mobilityradar_rail_duplicates_total", "counter", "Duplicate rail observations rejected by live state.", this.railDuplicates),
      metric("mobilityradar_rail_out_of_order_total", "counter", "Out-of-order rail observations rejected by live state.", this.railOutOfOrder),
      metric("mobilityradar_rail_source_position_age_seconds", "gauge", "Age of the newest measured rail source position.", this.railPositionAgeSeconds),
      metric("mobilityradar_journey_source_messages_total", "counter", "Accepted InfoPlus journey envelopes.", this.journeyMessages),
      metric("mobilityradar_road_source_polls_total", "counter", "Accepted NDW road snapshot polls.", this.roadPolls),
      metric("mobilityradar_road_active_events", "gauge", "Active road events in live state.", this.roadEvents),
      metric("mobilityradar_websocket_clients", "gauge", "Connected realtime WebSocket clients.", this.websocketClients),
      metric("mobilityradar_persistence_writes_total", "counter", "Successful PostGIS persistence operations.", this.persistenceWrites),
      metric("mobilityradar_persistence_failures_total", "counter", "Failed PostGIS persistence operations.", this.persistenceFailures),
    ].join("");
  }
}
