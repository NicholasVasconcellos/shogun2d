export interface PlacedTileData {
  id: string;
  assetId: string;
  x: number;
  y: number;
  colliderWidth: number;
  colliderHeight: number;
}

interface LevelState {
  tiles: PlacedTileData[];
}

const levelState: LevelState = {
  tiles: [],
};

let nextTileId = 1;

const cloneTile = (tile: PlacedTileData): PlacedTileData => ({ ...tile });

export const getLevelTiles = (): PlacedTileData[] => levelState.tiles.map(cloneTile);

export const createLevelTile = (
  tile: Omit<PlacedTileData, 'id'>
): PlacedTileData => {
  const createdTile: PlacedTileData = {
    id: `tile-${nextTileId++}`,
    ...tile,
  };

  levelState.tiles = [...levelState.tiles, createdTile];
  return cloneTile(createdTile);
};

export const updateLevelTile = (
  id: string,
  updates: Partial<Omit<PlacedTileData, 'id'>>
): void => {
  levelState.tiles = levelState.tiles.map((tile) => (
    tile.id === id ? { ...tile, ...updates } : tile
  ));
};

export const deleteLevelTile = (id: string): void => {
  levelState.tiles = levelState.tiles.filter((tile) => tile.id !== id);
};

export const restoreLevelTile = (tile: PlacedTileData): void => {
  levelState.tiles = [...levelState.tiles, { ...tile }];
};
