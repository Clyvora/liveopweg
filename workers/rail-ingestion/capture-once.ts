import { gunzipSync, inflateSync, unzipSync } from "node:zlib";
import { Subscriber } from "zeromq";

const endpoint = process.env.NDOV_ENDPOINT ?? "tcp://pubsub.besteffort.ndovloket.nl:7664";
const topic = process.env.NDOV_TOPIC ?? "/RIG/NStreinpositiesInterface5";
const socket = new Subscriber({ receiveHighWaterMark: 10 });

function preview(frame: Buffer): string {
  const candidates = frame[0] === 0x1f && frame[1] === 0x8b
    ? [() => gunzipSync(frame), () => frame]
    : [() => frame, () => unzipSync(frame), () => inflateSync(frame)];

  for (const candidate of candidates) {
    try {
      const decoded = candidate();
      const text = decoded.toString("utf8");
      if (text.includes("<") || text.includes("Trein")) {
        return text.slice(0, 1_200);
      }
    } catch {
      // Try the next supported encoding.
    }
  }

  return frame.subarray(0, 80).toString("hex");
}

socket.connect(endpoint);
socket.subscribe(topic);
console.log(JSON.stringify({ event: "subscribed", endpoint, topic }));

const timeout = setTimeout(() => {
  console.error(JSON.stringify({ event: "timeout", seconds: 45 }));
  socket.close();
  process.exitCode = 1;
}, 45_000);

for await (const frames of socket) {
  clearTimeout(timeout);
  console.log(JSON.stringify({
    event: "message",
    frameCount: frames.length,
    frames: frames.map((frame, index) => ({ index, bytes: frame.length, preview: preview(frame) })),
  }, null, 2));
  socket.close();
  break;
}
