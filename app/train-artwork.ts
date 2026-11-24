export const genericTrainImage = "/trains/side-unknown.png";

const modelImages: Record<string, string> = {
  "VIRM": "/trains/side-virm.png",
  "ICNG": "/trains/side-icng.png",
  "ICM": "/trains/side-icm.png",
  "SNG": "/trains/side-sng.png",
  "SLT": "/trains/side-slt.png",
  "FLIRT": "/trains/side-flirt.webp",
  "DDZ": "/trains/side-ddz.webp",
};

export function trainArtwork(model: string | null, operator?: string | null) {
  const modelKey = model?.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  const src = Object.hasOwn(modelImages, modelKey) ? modelImages[modelKey] : undefined;
  if (src) return { src, kind: "model" } as const;
  const brand = operator?.trim().toLowerCase() ?? "";
  if (/^arriva\b/.test(brand)) return { src: "/trains/side-arriva.webp", kind: "representative" } as const;
  if (/^blauwnet\b/.test(brand)) return { src: "/trains/side-blauwnet.webp", kind: "representative" } as const;
  return { src: genericTrainImage, kind: "generic" } as const;
}
