export interface ColliderConfig {
  type: 'rectangle' | 'circle';
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  radius: number;
  circleOffsetX: number;
  circleOffsetY: number;
  scale: number;
}

const STORAGE_KEY = 'shogun2d-collider';

const DEFAULT_COLLIDER: ColliderConfig = {
  type: 'rectangle',
  width: 24,
  height: 40,
  offsetX: 36,
  offsetY: 50,
  radius: 20,
  circleOffsetX: 38,
  circleOffsetY: 38,
  scale: 1,
};

let config: ColliderConfig = { ...DEFAULT_COLLIDER };

export const getColliderConfig = (): ColliderConfig => ({ ...config });

export const setColliderConfig = (updates: Partial<ColliderConfig>): void => {
  config = { ...config, ...updates };
};

export const resetColliderConfig = (): void => {
  config = { ...DEFAULT_COLLIDER };
};

export const saveColliderConfig = (): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

export const loadColliderConfig = (): void => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      config = { ...DEFAULT_COLLIDER, ...JSON.parse(stored) };
    } catch {
      config = { ...DEFAULT_COLLIDER };
    }
  }
};

// Auto-load on module init
loadColliderConfig();
