"""Generate the low-zoom rail layer from the bundled ProRail/PDOK geometry (CC0)."""

import argparse
from collections import defaultdict
import gzip
import json
from pathlib import Path


def simplify(points, tolerance=0.00055):
    """Retain endpoints and bends visible on a national or regional map."""
    keep = {0, len(points) - 1}
    pending = [(0, len(points) - 1)]
    while pending:
        first, last = pending.pop()
        x, y = points[first]
        dx, dy = points[last][0] - x, points[last][1] - y
        length = dx * dx + dy * dy
        furthest, split = tolerance * tolerance, None
        for index in range(first + 1, last):
            px, py = points[index][0] - x, points[index][1] - y
            fraction = max(0, min(1, (px * dx + py * dy) / length)) if length else 0
            distance = (px - dx * fraction) ** 2 + (py - dy * fraction) ** 2
            if distance > furthest:
                furthest, split = distance, index
        if split is not None:
            keep.add(split)
            pending.extend([(first, split), (split, last)])
    return [points[index] for index in sorted(keep)]


def network(features):
    edges = []
    endpoints = defaultdict(list)
    for feature in features:
        if feature["geometry"]["type"] != "LineString":
            continue
        points = [tuple(round(value, 5) for value in point[:2]) for point in feature["geometry"]["coordinates"]]
        if len(points) < 2:
            continue
        index = len(edges)
        edges.append(points)
        endpoints[points[0]].append(index)
        endpoints[points[-1]].append(index)

    seen = set()
    emitted = set()
    for start in range(len(edges)):
        if start in seen:
            continue
        seen.add(start)
        points = edges[start][:]
        for _ in range(2):
            while len(endpoints[points[-1]]) == 2:
                next_id = next((item for item in endpoints[points[-1]] if item not in seen), None)
                if next_id is None:
                    break
                seen.add(next_id)
                next_edge = edges[next_id]
                if next_edge[-1] == points[-1]:
                    next_edge = next_edge[::-1]
                points.extend(next_edge[1:])
            points.reverse()
        rounded = []
        for x, y in simplify(points):
            point = (round(x, 4), round(y, 4))
            if not rounded or rounded[-1] != point:
                rounded.append(point)
        if len(rounded) > 1:
            key = min(tuple(rounded), tuple(reversed(rounded)))
            if key not in emitted:
                emitted.add(key)
                yield rounded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="ProRail/PDOK track-geometry.geojson.gz")
    parser.add_argument("--output", type=Path, default=Path("public/rail/overview.geojson"))
    args = parser.parse_args()
    with gzip.open(args.source, "rt", encoding="utf-8") as stream:
        lines = list(network(json.load(stream)["features"]))
    result = {"type": "FeatureCollection", "features": [{
        "type": "Feature", "properties": {}, "geometry": {"type": "MultiLineString", "coordinates": lines},
    }]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(result, separators=(",", ":")) + "\n"
    args.output.write_text(payload, encoding="utf-8")
    print(f"{len(lines):,} lines, {len(payload):,} bytes, {len(gzip.compress(payload.encode())):,} bytes gzipped")


if __name__ == "__main__":
    main()
