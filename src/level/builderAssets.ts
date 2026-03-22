export interface BuilderAssetDefinition {
  id: string;
  label: string;
  texture: string;
  frame?: number;
  scale: number;
  defaultColliderWidth: number;
  defaultColliderHeight: number;
}

const assetMap = new Map<string, BuilderAssetDefinition>();

const makeTilesetAssets = (
  prefix: string,
  texture: string,
  startFrame: number,
  endFrame: number
): BuilderAssetDefinition[] => {
  const assets: BuilderAssetDefinition[] = [];

  for (let frame = startFrame; frame <= endFrame; frame += 1) {
    assets.push({
      id: `${texture}-${frame}`,
      label: `${prefix} ${frame}`,
      texture,
      frame,
      scale: 2,
      defaultColliderWidth: 32,
      defaultColliderHeight: 32,
    });
  }

  return assets;
};

export const BUILDER_ASSETS: BuilderAssetDefinition[] = [
  ...makeTilesetAssets('Tileset', 'tileset-grid', 0, 51),
  ...makeTilesetAssets('Tileset V2', 'tileset-v2-grid', 0, 51),
  ...Array.from({ length: 8 }, (_, frame) => ({
    id: `props-strip-${frame}`,
    label: `Prop ${frame}`,
    texture: 'props-strip',
    frame,
    scale: 2,
    defaultColliderWidth: 48,
    defaultColliderHeight: 24,
  })),
  {
    id: 'flag-0',
    label: 'Flag',
    texture: 'flag',
    frame: 0,
    scale: 2,
    defaultColliderWidth: 24,
    defaultColliderHeight: 96,
  },
];

BUILDER_ASSETS.forEach((asset) => {
  assetMap.set(asset.id, asset);
});

export const getBuilderAssetById = (id: string): BuilderAssetDefinition => {
  const asset = assetMap.get(id);
  if (!asset) {
    throw new Error(`Unknown builder asset: ${id}`);
  }

  return asset;
};
