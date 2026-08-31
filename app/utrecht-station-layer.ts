import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";
import type { StationBundle } from "../packages/domain-rail/station-bundle";
import { placeCarsOnCurve } from "../packages/domain-rail/station-3d";

export interface StationTrain3d {
  vehicleId: string;
  trainNumber: string;
  edgeId: string;
  edgeProgress: number;
  selected: boolean;
}

export interface StationLayerStats {
  railCurves: number;
  railSegments: number;
  sleepers: number;
  platforms: number;
  liveVehicles: number;
}

function scenePoint(position: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(position[0], position[2], -position[1]);
}

function segmentMatrix(
  left: THREE.Vector3,
  right: THREE.Vector3,
  crossOffset: number,
  verticalOffset: number,
  height: number,
  width: number,
): THREE.Matrix4 {
  const deltaX = right.x - left.x;
  const deltaZ = right.z - left.z;
  const length = Math.hypot(deltaX, deltaZ);
  const normalX = length ? -deltaZ / length : 0;
  const normalZ = length ? deltaX / length : 0;
  const position = new THREE.Vector3(
    (left.x + right.x) / 2 + normalX * crossOffset,
    (left.y + right.y) / 2 + verticalOffset,
    (left.z + right.z) / 2 + normalZ * crossOffset,
  );
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-deltaZ, deltaX), 0));
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(length, height, width));
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}

export class UtrechtStationLayer implements CustomLayerInterface {
  readonly id = "utrecht-station-detail-3d";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;
  private map: MapLibreMap | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly localTransform: THREE.Matrix4;
  private trainGroup: THREE.Group | null = null;
  private latestTrains: StationTrain3d[] = [];

  constructor(
    private readonly bundle: StationBundle,
    private readonly onStats: (stats: StationLayerStats) => void,
  ) {
    const origin = MercatorCoordinate.fromLngLat(
      [bundle.station.origin[0], bundle.station.origin[1]],
      bundle.station.origin[2],
    );
    const scale = origin.meterInMercatorCoordinateUnits();
    this.localTransform = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(scale, -scale, scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  }

  setTrains(trains: StationTrain3d[]): void {
    this.latestTrains = trains;
    if (this.scene) this.rebuildTrains();
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.scene.add(new THREE.HemisphereLight(0xfff8e8, 0x27453f, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-120, 220, -80);
    this.scene.add(sun);
    this.buildInfrastructure();
    this.rebuildTrains();
  }

  private buildInfrastructure(): void {
    if (!this.scene) return;
    const segments: Array<[THREE.Vector3, THREE.Vector3]> = [];
    for (const curve of this.bundle.rail.curves) {
      for (let index = 1; index < curve.localPoints.length; index += 1) {
        if (segments.length >= this.bundle.renderBudget.maxStationRailSegments) break;
        segments.push([scenePoint(curve.localPoints[index - 1]), scenePoint(curve.localPoints[index])]);
      }
    }
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const ballast = new THREE.InstancedMesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x756f68, roughness: 0.96 }), segments.length);
    const rails = new THREE.InstancedMesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x6c7780, metalness: 0.72, roughness: 0.28 }), segments.length * 2);
    ballast.name = "ballast";
    rails.name = "left-right-rails";
    segments.forEach(([left, right], index) => {
      ballast.setMatrixAt(index, segmentMatrix(left, right, 0, -0.2, 0.24, 3.5));
      rails.setMatrixAt(index * 2, segmentMatrix(left, right, -0.7175, 0.04, 0.12, 0.075));
      rails.setMatrixAt(index * 2 + 1, segmentMatrix(left, right, 0.7175, 0.04, 0.12, 0.075));
    });
    ballast.instanceMatrix.needsUpdate = true;
    rails.instanceMatrix.needsUpdate = true;
    this.scene.add(ballast, rails);

    const sleeperMatrices: THREE.Matrix4[] = [];
    const sleeperLimit = 8_000;
    for (const [left, right] of segments) {
      const distance = left.distanceTo(right);
      const count = Math.floor(distance / this.bundle.renderBudget.sleeperSpacingMeters);
      for (let index = 0; index < count && sleeperMatrices.length < sleeperLimit; index += 1) {
        const progress = (index + 0.5) / count;
        const center = left.clone().lerp(right, progress);
        const directionX = right.x - left.x;
        const directionZ = right.z - left.z;
        const angle = Math.atan2(-directionZ, directionX) + Math.PI / 2;
        sleeperMatrices.push(new THREE.Matrix4().compose(
          new THREE.Vector3(center.x, center.y - 0.04, center.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
          new THREE.Vector3(2.65, 0.13, 0.23),
        ));
      }
      if (sleeperMatrices.length >= sleeperLimit) break;
    }
    const sleepers = new THREE.InstancedMesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x493e35, roughness: 1 }), sleeperMatrices.length);
    sleepers.name = "sleepers";
    sleeperMatrices.forEach((matrix, index) => sleepers.setMatrixAt(index, matrix));
    sleepers.instanceMatrix.needsUpdate = true;
    this.scene.add(sleepers);

    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0xd7d1c2, roughness: 0.9, side: THREE.DoubleSide });
    for (const platform of this.bundle.platforms.polygons) {
      for (const [polygonIndex, rings] of platform.localPolygons.entries()) {
        const [outer, ...holes] = rings;
        if (!outer || outer.length < 3) continue;
        const shape = new THREE.Shape(outer.map((point) => new THREE.Vector2(point[0], point[1])));
        shape.holes = holes.filter((ring) => ring.length >= 3)
          .map((ring) => new THREE.Path(ring.map((point) => new THREE.Vector2(point[0], point[1]))));
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false, curveSegments: 1 });
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, 0.1, 0);
        const mesh = new THREE.Mesh(geometry, platformMaterial);
        mesh.name = `bgt-platform:${platform.id}:${polygonIndex}`;
        this.scene.add(mesh);
      }
    }
    this.onStats({
      railCurves: this.bundle.rail.curves.length,
      railSegments: segments.length,
      sleepers: sleeperMatrices.length,
      platforms: this.bundle.platforms.polygons.length,
      liveVehicles: this.latestTrains.length,
    });
  }

  private addCar(group: THREE.Group, position: [number, number, number], tangent: [number, number, number], color: number, length = 18): void {
    const geometry = new THREE.BoxGeometry(length, 3.65, 2.85);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.12 });
    const car = new THREE.Mesh(geometry, material);
    car.position.copy(scenePoint(position));
    car.position.y += 2.1;
    car.rotation.y = Math.atan2(tangent[0], tangent[1]) - Math.PI / 2;
    group.add(car);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(length - 0.8, 0.25, 2.45),
      new THREE.MeshStandardMaterial({ color: 0xf3f0e5, roughness: 0.62 }),
    );
    roof.position.copy(car.position);
    roof.position.y += 1.95;
    roof.rotation.copy(car.rotation);
    group.add(roof);
  }

  private rebuildTrains(): void {
    if (!this.scene) return;
    if (this.trainGroup) {
      this.scene.remove(this.trainGroup);
      disposeObject(this.trainGroup);
    }
    const group = new THREE.Group();
    group.name = "source-derived-live-trains-and-labelled-curve-demo";
    const curves = new Map(this.bundle.rail.curves.map((curve) => [curve.edgeId, curve]));
    for (const train of this.latestTrains) {
      const curve = curves.get(train.edgeId);
      if (!curve) continue;
      const placement = placeCarsOnCurve(curve.localPoints, train.edgeProgress, 1, 18, 0)[0];
      if (placement) this.addCar(group, placement.position, placement.tangent, train.selected ? 0xf17845 : 0x1b6756);
    }
    const demoCurve = this.bundle.rail.curves
      .filter((curve) => curve.localPoints.length >= 4 && curve.lengthMeters >= 120)
      .sort((left, right) => right.localPoints.length - left.localPoints.length)[0];
    if (demoCurve) {
      for (const placement of placeCarsOnCurve(demoCurve.localPoints, 0.52, 4, 18, 1.2)) {
        this.addCar(group, [placement.position[0], placement.position[1], placement.position[2] + 0.08], placement.tangent, 0xd88b3e);
      }
    }
    this.trainGroup = group;
    this.scene.add(group);
    this.onStats({
      railCurves: this.bundle.rail.curves.length,
      railSegments: this.bundle.rail.curves.reduce((total, curve) => total + Math.max(0, curve.localPoints.length - 1), 0),
      sleepers: Math.min(8_000, Math.floor(this.bundle.rail.curves.reduce((total, curve) => total + curve.lengthMeters, 0) / this.bundle.renderBudget.sleeperSpacingMeters)),
      platforms: this.bundle.platforms.polygons.length,
      liveVehicles: this.latestTrains.length,
    });
    this.map?.triggerRepaint();
  }

  render(_gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix);
    this.camera.projectionMatrix.multiply(this.localTransform);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  onRemove(): void {
    if (this.scene) disposeObject(this.scene);
    this.renderer?.dispose();
    this.map = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.trainGroup = null;
  }
}
