import Phaser from 'phaser';
import { BUILDER_ASSETS, BuilderAssetDefinition, getBuilderAssetById } from '../level/builderAssets';
import { LevelBuilder } from '../level/LevelBuilder';
import {
  createLevelTile,
  deleteLevelTile,
  getLevelTiles,
  PlacedTileData,
  updateLevelTile,
} from '../level/levelState';

interface PlacedAsset {
  tileId: string;
  asset: BuilderAssetDefinition;
  sprite: Phaser.GameObjects.Image;
  collider: Phaser.GameObjects.Rectangle;
  deleteButton: Phaser.GameObjects.Container;
}

export class LevelBuilderScene extends Phaser.Scene {
  private readonly paletteWidth = 240;
  private readonly paletteTop = 170;
  private readonly palettePadding = 16;
  private readonly iconSize = 56;
  private readonly gridSize = 32;

  private level!: LevelBuilder;
  private selectedAsset: BuilderAssetDefinition = BUILDER_ASSETS[0];
  private colliderWidth = BUILDER_ASSETS[0].defaultColliderWidth;
  private colliderHeight = BUILDER_ASSETS[0].defaultColliderHeight;
  private paletteScrollY = 0;
  private paletteContentHeight = 0;

  private paletteItems: Array<{
    container: Phaser.GameObjects.Container;
    frameRect: Phaser.GameObjects.Rectangle;
    asset: BuilderAssetDefinition;
  }> = [];
  private paletteMaskShape!: Phaser.GameObjects.Graphics;
  private dragPreview?: Phaser.GameObjects.Image;
  private dragPreviewCollider?: Phaser.GameObjects.Rectangle;
  private selectedPlacedAsset?: PlacedAsset;

  private hudTexts!: {
    selected: Phaser.GameObjects.Text;
    collider: Phaser.GameObjects.Text;
    help: Phaser.GameObjects.Text;
  };

  private cameraKeys?: Record<string, Phaser.Input.Keyboard.Key>;
  private placedAssets: PlacedAsset[] = [];

  private playerX?: number;
  private playerY?: number;
  private playerFlipX?: boolean;
  private playerAnim?: string;

  constructor() {
    super({ key: 'LevelBuilder' });
  }

  init(data: {
    playerX?: number;
    playerY?: number;
    playerFlipX?: boolean;
    playerAnim?: string;
  }): void {
    this.playerX = data.playerX;
    this.playerY = data.playerY;
    this.playerFlipX = data.playerFlipX;
    this.playerAnim = data.playerAnim;
  }

  create(): void {
    this.level = new LevelBuilder(this);
    this.level.build();

    this.cameras.main.setBounds(0, 0, this.level.WORLD_WIDTH, this.level.WORLD_HEIGHT);
    this.cameras.main.setZoom(1);

    // Show player sprite if position was passed
    if (this.playerX !== undefined && this.playerY !== undefined) {
      const playerSprite = this.add.sprite(this.playerX, this.playerY, 'samurai-idle')
        .setScale(2)
        .setDepth(100)
        .setAlpha(0.7); // Slightly faded to show it's "fixed" and not active

      if (this.playerFlipX !== undefined) {
        playerSprite.setFlipX(this.playerFlipX);
      }

      if (this.playerAnim) {
        playerSprite.play(this.playerAnim);
      } else {
        playerSprite.play('player-idle');
      }
    }

    this.createPalette();
    this.createHud();
    this.loadPlacedTiles();
    this.registerInput();
    this.refreshHud();
  }

  update(_time: number, delta: number): void {
    if (!this.cameraKeys) {
      return;
    }

    const cam = this.cameras.main;
    const speed = (delta / 1000) * 520;

    if (this.cameraKeys.left.isDown) {
      cam.scrollX = Math.max(0, cam.scrollX - speed);
    }

    if (this.cameraKeys.right.isDown) {
      cam.scrollX = Math.min(this.level.WORLD_WIDTH - cam.width, cam.scrollX + speed);
    }

    if (this.cameraKeys.up.isDown) {
      cam.scrollY = Math.max(0, cam.scrollY - speed);
    }

    if (this.cameraKeys.down.isDown) {
      cam.scrollY = Math.min(this.level.WORLD_HEIGHT - cam.height, cam.scrollY + speed);
    }
  }

  private createPalette(): void {
    const cameraHeight = this.scale.height;

    this.add.rectangle(0, 0, this.paletteWidth, cameraHeight, 0x11151c, 0.94)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(2, 0x314355, 1);

    this.paletteMaskShape = this.add.graphics().setScrollFactor(0).setDepth(1002);
    this.paletteMaskShape.fillStyle(0xffffff, 1);
    this.paletteMaskShape.fillRect(0, this.paletteTop, this.paletteWidth, cameraHeight - this.paletteTop);
    const mask = this.paletteMaskShape.createGeometryMask();

    const columns = 3;
    const spacing = 12;
    const startY = this.paletteTop + 20;

    BUILDER_ASSETS.forEach((asset, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = this.palettePadding + col * (this.iconSize + spacing);
      const y = startY + row * (this.iconSize + 34);

      const frameRect = this.add.rectangle(x, y, this.iconSize, this.iconSize, 0x1b2530, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x314355, 1);

      const icon = this.add.image(
        x + this.iconSize / 2,
        y + this.iconSize / 2,
        asset.texture,
        asset.frame
      ).setOrigin(0.5);

      const iconScale = Math.min(
        asset.scale,
        (this.iconSize - 16) / icon.width,
        (this.iconSize - 16) / icon.height
      );
      icon.setScale(iconScale);

      const label = this.add.text(x, y + this.iconSize + 4, asset.label, {
        fontSize: '10px',
        color: '#d9e2ec',
        wordWrap: { width: this.iconSize },
      });

      const hitArea = this.add.zone(x, y, this.iconSize, this.iconSize)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(1004);

      hitArea.setData('asset', asset);
      hitArea.on('pointerdown', () => {
        this.selectAsset(asset);
      });
      this.input.setDraggable(hitArea);

      const container = this.add.container(0, 0, [frameRect, icon, label, hitArea])
        .setScrollFactor(0)
        .setDepth(1003);
      container.setMask(mask);

      this.paletteItems.push({ container, frameRect, asset });
    });

    const rows = Math.ceil(BUILDER_ASSETS.length / columns);
    this.paletteContentHeight = startY + rows * (this.iconSize + 34);
    this.layoutPaletteItems();
    this.updatePaletteSelection();
  }

  private createHud(): void {
    this.add.text(16, 16, 'Level Builder', {
      fontSize: '22px',
      color: '#f0f4f8',
    }).setScrollFactor(0).setDepth(1100);

    this.hudTexts = {
      selected: this.add.text(16, 48, '', {
        fontSize: '12px',
        color: '#bcccdc',
      }).setScrollFactor(0).setDepth(1100),
      collider: this.add.text(16, 72, '', {
        fontSize: '12px',
        color: '#bcccdc',
      }).setScrollFactor(0).setDepth(1100),
      help: this.add.text(16, 96, '', {
        fontSize: '12px',
        color: '#829ab1',
        wordWrap: { width: this.paletteWidth - 32 },
      }).setScrollFactor(0).setDepth(1100),
    };

    this.createActionButton(16, 140, '-W', 48, () => this.adjustColliderWidth(-this.gridSize), 0x243b53);
    this.createActionButton(72, 140, '+W', 48, () => this.adjustColliderWidth(this.gridSize), 0x243b53);
    this.createActionButton(128, 140, '-H', 48, () => this.adjustColliderHeight(-this.gridSize), 0x243b53);
    this.createActionButton(184, 140, '+H', 48, () => this.adjustColliderHeight(this.gridSize), 0x243b53);
    this.createActionButton(16, 440, 'Delete', 96, () => this.deleteSelectedTile(), 0x742a2a);
    this.createActionButton(120, 440, 'Exit', 96, () => this.exitToGame(), 0x22543d);
  }

  private createActionButton(
    x: number,
    y: number,
    label: string,
    width: number,
    onClick: () => void,
    color: number
  ): void {
    const button = this.add.rectangle(x, y, width, 24, color, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1100)
      .setStrokeStyle(1, 0x486581, 1)
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', onClick);

    this.add.text(x + width / 2, y + 12, label, {
      fontSize: '11px',
      color: '#f0f4f8',
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1101);
  }

  private registerInput(): void {
    this.cameraKeys = this.input.keyboard?.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
      this.exitToGame();
    });

    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.DELETE).on('down', () => {
      this.deleteSelectedTile();
    });

    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
        if (pointer.x > this.paletteWidth || pointer.y < this.paletteTop) {
          return;
        }

        const viewportHeight = this.scale.height - this.paletteTop;
        const maxScroll = Math.max(0, this.paletteContentHeight - viewportHeight - 16);
        this.paletteScrollY = Phaser.Math.Clamp(this.paletteScrollY + dy * 0.5, 0, maxScroll);
        this.layoutPaletteItems();
      }
    );

    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const asset = gameObject.getData('asset') as BuilderAssetDefinition | undefined;
      if (!asset) {
        return;
      }

      this.selectAsset(asset);
      this.dragPreview = this.add.image(0, 0, asset.texture, asset.frame)
        .setScale(asset.scale)
        .setAlpha(0.85)
        .setDepth(900);
      this.dragPreviewCollider = this.add.rectangle(0, 0, this.colliderWidth, this.colliderHeight)
        .setStrokeStyle(2, 0x68d391, 0.9)
        .setFillStyle(0x68d391, 0.12)
        .setDepth(901);
    });

    this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const paletteAsset = gameObject.getData('asset') as BuilderAssetDefinition | undefined;
      if (paletteAsset && this.dragPreview && this.dragPreviewCollider) {
        const point = this.getSnappedPoint(pointer);
        this.dragPreview.setPosition(point.x, point.y);
        this.dragPreviewCollider.setPosition(point.x, point.y);
        return;
      }

      const placedAsset = gameObject.getData('placedAsset') as PlacedAsset | undefined;
      if (!placedAsset) {
        return;
      }

      const point = this.getSnappedPoint(pointer);
      placedAsset.sprite.setPosition(point.x, point.y);
      placedAsset.collider.setPosition(point.x, point.y);
      this.updateStaticBody(
        placedAsset.sprite,
        placedAsset.collider.displayWidth,
        placedAsset.collider.displayHeight
      );
      this.layoutDeleteButton(placedAsset);
      updateLevelTile(placedAsset.tileId, { x: point.x, y: point.y });
    });

    this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const asset = gameObject.getData('asset') as BuilderAssetDefinition | undefined;
      if (asset && pointer.x > this.paletteWidth) {
        const point = this.getSnappedPoint(pointer);
        this.placeAsset(asset, point.x, point.y);
      }

      this.dragPreview?.destroy();
      this.dragPreviewCollider?.destroy();
      this.dragPreview = undefined;
      this.dragPreviewCollider = undefined;
    });
  }

  private loadPlacedTiles(): void {
    getLevelTiles().forEach((tile) => {
      this.placeAsset(getBuilderAssetById(tile.assetId), tile.x, tile.y, tile);
    });
  }

  private placeAsset(
    asset: BuilderAssetDefinition,
    x: number,
    y: number,
    existingTile?: PlacedTileData
  ): void {
    const tileData = existingTile ?? createLevelTile({
      assetId: asset.id,
      x,
      y,
      colliderWidth: this.colliderWidth,
      colliderHeight: this.colliderHeight,
    });

    const sprite = this.add.image(x, y, asset.texture, asset.frame)
      .setScale(asset.scale)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    this.physics.add.existing(sprite, true);

    const collider = this.add.rectangle(x, y, tileData.colliderWidth, tileData.colliderHeight)
      .setStrokeStyle(2, 0x63b3ed, 0.9)
      .setFillStyle(0x63b3ed, 0.14)
      .setDepth(11);

    const deleteButton = this.createDeleteButton();
    const placedAsset: PlacedAsset = {
      tileId: tileData.id,
      asset,
      sprite,
      collider,
      deleteButton,
    };

    sprite.setData('placedAsset', placedAsset);
    this.input.setDraggable(sprite);

    sprite.on('pointerdown', () => {
      this.selectedPlacedAsset = placedAsset;
      this.syncColliderControlsFromPlacedAsset(placedAsset);
      this.refreshPlacedHighlights();
    });

    this.updateStaticBody(sprite, collider.displayWidth, collider.displayHeight);
    this.layoutDeleteButton(placedAsset);
    this.placedAssets.push(placedAsset);
    this.selectedPlacedAsset = placedAsset;
    this.refreshPlacedHighlights();
  }

  private createDeleteButton(): Phaser.GameObjects.Container {
    const background = this.add.circle(0, 0, 10, 0x9b2c2c, 1)
      .setStrokeStyle(2, 0xfbd38d, 1);
    const label = this.add.text(0, -1, 'x', {
      fontSize: '12px',
      color: '#fff5f5',
    }).setOrigin(0.5);

    const button = this.add.container(0, 0, [background, label])
      .setDepth(12)
      .setSize(20, 20)
      .setInteractive(new Phaser.Geom.Circle(0, 0, 10), Phaser.Geom.Circle.Contains);

    button.on('pointerdown', () => {
      const placedAsset = this.placedAssets.find((item) => item.deleteButton === button);
      if (placedAsset) {
        this.deletePlacedAsset(placedAsset);
      }
    });

    return button;
  }

  private updateStaticBody(
    sprite: Phaser.GameObjects.Image,
    colliderWidth: number,
    colliderHeight: number
  ): void {
    const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(colliderWidth, colliderHeight);
    body.position.x = sprite.x - colliderWidth / 2;
    body.position.y = sprite.y - colliderHeight / 2;
  }

  private selectAsset(asset: BuilderAssetDefinition): void {
    this.selectedAsset = asset;
    this.colliderWidth = asset.defaultColliderWidth;
    this.colliderHeight = asset.defaultColliderHeight;
    this.selectedPlacedAsset = undefined;
    this.updatePaletteSelection();
    this.refreshPlacedHighlights();
    this.refreshHud();
  }

  private syncColliderControlsFromPlacedAsset(placedAsset: PlacedAsset): void {
    this.selectedAsset = placedAsset.asset;
    this.colliderWidth = placedAsset.collider.displayWidth;
    this.colliderHeight = placedAsset.collider.displayHeight;
    this.updatePaletteSelection();
    this.refreshHud();
  }

  private adjustColliderWidth(amount: number): void {
    this.colliderWidth = Math.max(this.gridSize, this.colliderWidth + amount);
    if (this.selectedPlacedAsset) {
      this.selectedPlacedAsset.collider.setSize(this.colliderWidth, this.selectedPlacedAsset.collider.displayHeight);
      this.selectedPlacedAsset.collider.setDisplaySize(
        this.colliderWidth,
        this.selectedPlacedAsset.collider.displayHeight
      );
      this.updateStaticBody(
        this.selectedPlacedAsset.sprite,
        this.selectedPlacedAsset.collider.displayWidth,
        this.selectedPlacedAsset.collider.displayHeight
      );
      this.layoutDeleteButton(this.selectedPlacedAsset);
      updateLevelTile(this.selectedPlacedAsset.tileId, {
        colliderWidth: this.selectedPlacedAsset.collider.displayWidth,
      });
    }
    this.refreshHud();
  }

  private adjustColliderHeight(amount: number): void {
    this.colliderHeight = Math.max(this.gridSize, this.colliderHeight + amount);
    if (this.selectedPlacedAsset) {
      this.selectedPlacedAsset.collider.setSize(this.selectedPlacedAsset.collider.displayWidth, this.colliderHeight);
      this.selectedPlacedAsset.collider.setDisplaySize(
        this.selectedPlacedAsset.collider.displayWidth,
        this.colliderHeight
      );
      this.updateStaticBody(
        this.selectedPlacedAsset.sprite,
        this.selectedPlacedAsset.collider.displayWidth,
        this.selectedPlacedAsset.collider.displayHeight
      );
      this.layoutDeleteButton(this.selectedPlacedAsset);
      updateLevelTile(this.selectedPlacedAsset.tileId, {
        colliderHeight: this.selectedPlacedAsset.collider.displayHeight,
      });
    }
    this.refreshHud();
  }

  private refreshHud(): void {
    this.hudTexts.selected.setText(`Selected: ${this.selectedAsset.label}`);
    this.hudTexts.collider.setText(`Collider: ${this.colliderWidth} x ${this.colliderHeight}`);
    this.hudTexts.help.setText(
      'Drag palette tiles into the world. Drag placed tiles to reposition them. Delete removes the selected tile. Exit auto-saves and returns to the game.'
    );
  }

  private updatePaletteSelection(): void {
    this.paletteItems.forEach(({ frameRect, asset }) => {
      frameRect.setStrokeStyle(2, asset.id === this.selectedAsset.id ? 0xf6ad55 : 0x314355, 1);
    });
  }

  private refreshPlacedHighlights(): void {
    this.placedAssets.forEach((placedAsset) => {
      const isSelected = this.selectedPlacedAsset?.tileId === placedAsset.tileId;
      placedAsset.collider.setStrokeStyle(2, isSelected ? 0xf6ad55 : 0x63b3ed, 0.95);
      placedAsset.collider.setFillStyle(isSelected ? 0xf6ad55 : 0x63b3ed, isSelected ? 0.18 : 0.14);
      placedAsset.deleteButton.setAlpha(isSelected ? 1 : 0.8);
    });
  }

  private layoutDeleteButton(placedAsset: PlacedAsset): void {
    placedAsset.deleteButton.setPosition(
      placedAsset.sprite.x + placedAsset.collider.displayWidth / 2 - 6,
      placedAsset.sprite.y - placedAsset.collider.displayHeight / 2 + 6
    );
  }

  private deleteSelectedTile(): void {
    if (this.selectedPlacedAsset) {
      this.deletePlacedAsset(this.selectedPlacedAsset);
    }
  }

  private deletePlacedAsset(placedAsset: PlacedAsset): void {
    deleteLevelTile(placedAsset.tileId);
    placedAsset.sprite.destroy();
    placedAsset.collider.destroy();
    placedAsset.deleteButton.destroy();
    this.placedAssets = this.placedAssets.filter((item) => item.tileId !== placedAsset.tileId);

    if (this.selectedPlacedAsset?.tileId === placedAsset.tileId) {
      this.selectedPlacedAsset = undefined;
    }

    this.refreshHud();
    this.refreshPlacedHighlights();
  }

  private exitToGame(): void {
    this.scene.start('Game');
  }

  private layoutPaletteItems(): void {
    this.paletteItems.forEach(({ container }) => {
      container.y = -this.paletteScrollY;
    });
  }

  private getSnappedPoint(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return {
      x: Phaser.Math.Snap.To(pointer.worldX, this.gridSize),
      y: Phaser.Math.Snap.To(pointer.worldY, this.gridSize),
    };
  }
}
