import type { JourneyRealtimeMessage } from "../packages/protocol/journey";

/** Timetables may arrive after a later selection. Never attach them by arrival order. */
export function journeyMatchesSelection(message: JourneyRealtimeMessage, trainNumber: string | null): boolean {
  return Boolean(trainNumber && message.link && message.link.trainNumber === trainNumber
    && (!message.data || (message.data.trainNumber === trainNumber && message.data.serviceDate === message.link.serviceDate)));
}
