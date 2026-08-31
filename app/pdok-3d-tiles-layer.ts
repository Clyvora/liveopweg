import { TilesRenderer } from "3d-tiles-renderer/three";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

export type TilesLayerState = {
  status: "STARTING" | "STREAMING" | "READY" | "ERROR";
  visibleTiles: number;
  activeTiles: number;
  loadProgress: number;
  memoryBudgetMb: number;
};

function ecefToLngLatAlt(x: number, y: number, z: number): [number, number, number] {
  const semiMajor = 6_378_137;
  const eccentricitySquared = 6.69437999014e-3;
  const semiMinor = semiMajor * Math.sqrt(1 - eccentricitySquared);
  const secondEccentricitySquared = (semiMajor ** 2 - semiMinor ** 2) / semiMinor ** 2;
  const horizontal = Math.hypot(x, y);
  const theta = Math.atan2(semiMajor * z, semiMinor * horizontal);
  const longitude = Math.atan2(y, x);
  const latitude = Math.atan2(
    z + secondEccentricitySquared * semiMinor * Math.sin(theta) ** 3,
    horizontal - eccentricitySquared * semiMajor * Math.cos(theta) ** 3,
  );
  const normal = semiMajor / Math.sqrt(1 - eccentricitySquared * Math.sin(latitude) ** 2);
  const altitude = horizontal / Math.cos(latitude) - normal;
  return [longitude * 180 / Math.PI, latitude * 180 / Math.PI, altitude];
}

export class Pdok3dTilesLayer implements CustomLayerInterface {
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;
  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private tilesCamera: THREE.PerspectiveCamera | null = null;
  private tiles: TilesRenderer | null = null;
  private localTransform: THREE.Matrix4 | null = null;
  private lastStatsAt = 0;

  constructor(
    readonly id: string,
    private readonly url: string,
    private readonly memoryBudgetMb: number,
    private readonly maxDownloads: number,
    private readonly maxParses: number,
    private readonly onState: (state: TilesLayerState) => void,
  ) {}

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.camera = new THREE.Camera();
    this.tilesCamera = new THREE.PerspectiveCamera();
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.185.1/examples/jsm/libs/draco/");
    gltfLoader.setDRACOLoader(dracoLoader);
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath("https://unpkg.com/three@0.185.1/examples/jsm/libs/basis/");
    ktx2Loader.detectSupport(this.renderer);
    gltfLoader.setKTX2Loader(ktx2Loader);

    const tiles = new TilesRenderer(this.url);
    this.tiles = tiles;
    tiles.group.name = this.id;
    tiles.setCamera(this.tilesCamera);
    tiles.setResolutionFromRenderer(this.tilesCamera, this.renderer);
    tiles.manager.addHandler(/\.(gltf|glb)$/i, gltfLoader);
    tiles.errorTarget = 10;
    tiles.loadSiblings = false;
    tiles.maxTilesProcessed = 60;
    tiles.lruCache.minSize = 3;
    tiles.lruCache.maxSize = 140;
    tiles.lruCache.maxBytesSize = this.memoryBudgetMb * 1024 * 1024;
    tiles.lruCache.unloadPercent = 0.2;
    tiles.downloadQueue.maxJobs = this.maxDownloads;
    tiles.parseQueue.maxJobs = this.maxParses;
    this.scene.add(tiles.group);

    tiles.addEventListener("load-tileset", () => this.alignTileset());
    tiles.addEventListener("needs-update", () => this.map?.triggerRepaint());
    tiles.addEventListener("tiles-load-start", () => this.report("STREAMING"));
    tiles.addEventListener("tiles-load-end", () => this.report("READY"));
    tiles.addEventListener("load-error", () => this.report("ERROR"));
    this.report("STARTING");
  }

  private alignTileset(): void {
    if (!this.tiles || this.localTransform) return;
    const sphere = new THREE.Sphere();
    if (!this.tiles.getBoundingSphere(sphere)) return;
    const center = sphere.center.clone();
    const [longitude, latitude, altitude] = ecefToLngLatAlt(center.x, center.y, center.z);
    const origin = MercatorCoordinate.fromLngLat([longitude, latitude], altitude);
    const scale = origin.meterInMercatorCoordinateUnits();
    this.localTransform = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(scale, -scale, scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

    const transform = this.tiles.root?.transform ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const rotation = new THREE.Matrix3().set(
      transform[0], transform[1], transform[2],
      transform[8], transform[9], transform[10],
      -transform[4], -transform[5], -transform[6],
    );
    this.tiles.group.matrix.copy(new THREE.Matrix4().setFromMatrix3(rotation)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z)));
    this.tiles.group.matrixAutoUpdate = false;
    this.tiles.group.updateMatrixWorld(true);
    this.map?.triggerRepaint();
  }

  private report(status: TilesLayerState["status"]): void {
    this.onState({
      status,
      visibleTiles: this.tiles?.visibleTiles.size ?? 0,
      activeTiles: this.tiles?.activeTiles.size ?? 0,
      loadProgress: this.tiles?.loadProgress ?? 0,
      memoryBudgetMb: this.memoryBudgetMb,
    });
  }

  render(_gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.renderer || !this.scene || !this.camera || !this.tilesCamera || !this.tiles || !this.localTransform) return;
    this.camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix);
    this.camera.projectionMatrix.multiply(this.localTransform);
    const projection = new THREE.Matrix4().fromArray(options.projectionMatrix);
    const view = projection.clone().invert().multiply(this.camera.projectionMatrix);
    this.tilesCamera.projectionMatrix.copy(projection);
    this.tilesCamera.matrixWorldInverse.copy(view);
    this.tilesCamera.matrixWorld.copy(view).invert();
    this.tiles.setResolutionFromRenderer(this.tilesCamera, this.renderer);
    this.tiles.update();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    const now = performance.now();
    if (now - this.lastStatsAt > 1_000) {
      this.lastStatsAt = now;
      this.report(this.tiles.loadProgress < 1 ? "STREAMING" : "READY");
    }
    if (this.map?.isMoving() || this.tiles.loadProgress < 1) this.map?.triggerRepaint();
  }

  onRemove(): void {
    this.tiles?.dispose();
    this.renderer?.dispose();
    this.map = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.tilesCamera = null;
    this.tiles = null;
    this.localTransform = null;
  }
}
