import Phaser from 'phaser';
import { BUILDER_ASSETS, BuilderAssetDefinition, getBuilderAssetById } from '../level/builderAssets';
import { LevelBuilder } from '../level/LevelBuilder';
import {
  createLevelTile,
  deleteLevelTile,
  getLevelTiles,
  PlacedTileData,
  restoreLevelTile,
  updateLevelTile,
} from '../level/levelState';

interface PlacedAsset {
  tileId: string;
  asset: BuilderAssetDefinition;
  sprite: Phaser.GameObjects.Image;
  collider: Phaser.GameObjects.Rectangle;
  deleteButton: Phaser.GameObjects.Container;
}

interface UndoAction {
  undo: () => void;
  redo: () => void;
}

export class LevelBuilderScene extends Phaser.Scene {
  private readonly gridSize = 32;

  private level!: LevelBuilder;
  private selectedAsset: BuilderAssetDefinition = BUILDER_ASSETS[0];
  private colliderWidth = BUILDER_ASSETS[0].defaultColliderWidth;
  private colliderHeight = BUILDER_ASSETS[0].defaultColliderHeight;

  // DOM references
  private uiRoot!: HTMLDivElement;
  private assetItems: HTMLDivElement[] = [];
  private selectedLabel!: HTMLSpanElement;
  private colliderLabel!: HTMLSpanElement;
  private widthValueEl!: HTMLSpanElement;
  private heightValueEl!: HTMLSpanElement;

  // Canvas objects
  private placementPreview?: Phaser.GameObjects.Image;
  private placementPreviewCollider?: Phaser.GameObjects.Rectangle;
  private selectedPlacedAsset?: PlacedAsset;
  private cameraKeys?: Record<string, Phaser.Input.Keyboard.Key>;
  private placedAssets: PlacedAsset[] = [];
  private lastDragPlaceKey?: string;
  private isPainting = false;
  private paintBatchTileIds: string[] = [];

  // Undo / redo
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private dragStartPos?: { x: number; y: number };

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

    if (this.playerX !== undefined && this.playerY !== undefined) {
      const playerSprite = this.add.sprite(this.playerX, this.playerY, 'samurai-idle')
        .setScale(2)
        .setDepth(100)
        .setAlpha(0.7);

      if (this.playerFlipX !== undefined) {
        playerSprite.setFlipX(this.playerFlipX);
      }

      if (this.playerAnim) {
        playerSprite.play(this.playerAnim);
      } else {
        playerSprite.play('player-idle');
      }
    }

    this.input.topOnly = true;

    this.buildUI();
    this.createPlacementPreview();
    this.loadPlacedTiles();
    this.registerInput();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.uiRoot.remove();
      this.assetItems = [];
    });
  }

  update(_time: number, delta: number): void {
    if (!this.cameraKeys) return;

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

    // Update placement preview position
    if (this.placementPreview && this.placementPreviewCollider) {
      const pointer = this.input.activePointer;
      const point = this.getSnappedPoint(pointer);
      this.placementPreview.setPosition(point.x, point.y);
      this.placementPreviewCollider.setPosition(point.x, point.y);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  HTML UI                                                            */
  /* ------------------------------------------------------------------ */

  private buildUI(): void {
    this.uiRoot = this.el('div', 'fixed inset-0 z-[1000] pointer-events-none font-sans');

    const sidebar = this.el('div', [
      'pointer-events-auto absolute left-0 top-0 bottom-0 w-[260px]',
      'bg-panel-bg/[0.96] border-r border-brd flex flex-col',
      'backdrop-blur-sm',
    ].join(' '));

    // Header
    const header = this.el('div', 'px-4 pt-4 pb-3 border-b border-brd/60');
    const titleRow = this.el('div', 'flex items-center justify-between');
    const title = this.el('span', 'font-mono font-semibold text-sm tracking-widest text-accent');
    title.textContent = 'LEVEL BUILDER';
    const badge = this.el('span', 'font-mono text-[10px] text-txt-muted bg-panel-surface px-2 py-0.5 rounded');
    badge.textContent = `${BUILDER_ASSETS.length} tiles`;
    titleRow.append(title, badge);
    header.appendChild(titleRow);
    sidebar.appendChild(header);

    // Info section
    const infoSection = this.el('div', 'px-4 py-3 border-b border-brd/60 space-y-1.5');

    const selectedRow = this.el('div', 'flex items-center gap-2');
    const selectedPrefix = this.el('span', 'text-[11px] font-sans text-txt-label');
    selectedPrefix.textContent = 'Selected';
    this.selectedLabel = this.el('span', 'text-[11px] font-mono text-txt-primary') as HTMLSpanElement;
    this.selectedLabel.textContent = this.selectedAsset.label;
    selectedRow.append(selectedPrefix, this.selectedLabel);

    const colliderRow = this.el('div', 'flex items-center gap-2');
    const colliderPrefix = this.el('span', 'text-[11px] font-sans text-txt-label');
    colliderPrefix.textContent = 'Collider';
    this.colliderLabel = this.el('span', 'text-[11px] font-mono text-txt-primary') as HTMLSpanElement;
    this.colliderLabel.textContent = `${this.colliderWidth} x ${this.colliderHeight}`;
    colliderRow.append(colliderPrefix, this.colliderLabel);

    infoSection.append(selectedRow, colliderRow);
    sidebar.appendChild(infoSection);

    // Collider controls
    const controlsSection = this.el('div', 'px-4 py-3 border-b border-brd/60 space-y-2');

    const widthRow = this.el('div', 'flex items-center gap-2');
    const widthLabel = this.el('span', 'text-[11px] font-sans text-txt-label w-12 shrink-0');
    widthLabel.textContent = 'Width';
    const wMinus = this.createCtrlBtn('\u2212', () => this.adjustColliderWidth(-this.gridSize));
    this.widthValueEl = this.el('span', 'text-xs font-mono text-txt-primary w-10 text-center') as HTMLSpanElement;
    this.widthValueEl.textContent = String(this.colliderWidth);
    const wPlus = this.createCtrlBtn('+', () => this.adjustColliderWidth(this.gridSize));
    widthRow.append(widthLabel, wMinus, this.widthValueEl, wPlus);

    const heightRow = this.el('div', 'flex items-center gap-2');
    const heightLabel = this.el('span', 'text-[11px] font-sans text-txt-label w-12 shrink-0');
    heightLabel.textContent = 'Height';
    const hMinus = this.createCtrlBtn('\u2212', () => this.adjustColliderHeight(-this.gridSize));
    this.heightValueEl = this.el('span', 'text-xs font-mono text-txt-primary w-10 text-center') as HTMLSpanElement;
    this.heightValueEl.textContent = String(this.colliderHeight);
    const hPlus = this.createCtrlBtn('+', () => this.adjustColliderHeight(this.gridSize));
    heightRow.append(heightLabel, hMinus, this.heightValueEl, hPlus);

    controlsSection.append(widthRow, heightRow);
    sidebar.appendChild(controlsSection);

    // Asset grid (scrollable)
    const listContainer = this.el('div', 'flex-1 overflow-y-auto se-scroll py-2 px-3');
    this.buildAssetGrid(listContainer);
    sidebar.appendChild(listContainer);

    // Undo / Redo row
    const undoRedoSection = this.el('div', 'px-4 py-2 border-t border-brd/60 flex gap-2');

    this.undoBtn = this.el('button', [
      'flex-1 h-8 rounded font-sans text-xs font-medium',
      'bg-panel-button border border-brd text-txt-muted',
      'hover:bg-brd-bright hover:border-brd-bright transition-colors',
      'disabled:opacity-30 disabled:pointer-events-none',
    ].join(' ')) as HTMLButtonElement;
    this.undoBtn.textContent = 'UNDO';
    this.undoBtn.disabled = true;
    this.undoBtn.addEventListener('click', () => this.undo());

    this.redoBtn = this.el('button', [
      'flex-1 h-8 rounded font-sans text-xs font-medium',
      'bg-panel-button border border-brd text-txt-muted',
      'hover:bg-brd-bright hover:border-brd-bright transition-colors',
      'disabled:opacity-30 disabled:pointer-events-none',
    ].join(' ')) as HTMLButtonElement;
    this.redoBtn.textContent = 'REDO';
    this.redoBtn.disabled = true;
    this.redoBtn.addEventListener('click', () => this.redo());

    undoRedoSection.append(this.undoBtn, this.redoBtn);
    sidebar.appendChild(undoRedoSection);

    // Action buttons
    const actionsSection = this.el('div', 'px-4 py-2 border-t border-brd/60 flex gap-2');

    const deleteBtn = this.el('button', [
      'flex-1 h-8 rounded font-sans text-xs font-medium',
      'bg-danger border border-accent/30 text-accent',
      'hover:bg-danger/80 hover:border-accent/50 transition-colors',
    ].join(' ')) as HTMLButtonElement;
    deleteBtn.textContent = 'DELETE';
    deleteBtn.addEventListener('click', () => this.deleteSelectedTile());

    const exitBtn = this.el('button', [
      'flex-1 h-8 rounded font-sans text-xs font-medium',
      'bg-success-dark border border-success/40 text-success',
      'hover:bg-success/20 hover:border-success/60 transition-colors',
    ].join(' ')) as HTMLButtonElement;
    exitBtn.textContent = 'EXIT';
    exitBtn.addEventListener('click', () => this.exitToGame());

    actionsSection.append(deleteBtn, exitBtn);
    sidebar.appendChild(actionsSection);

    // Help text
    const helpSection = this.el('div', 'px-4 py-2 border-t border-brd/40');
    const helpText = this.el('p', 'text-[10px] text-txt-muted leading-relaxed');
    helpText.textContent = 'Click tile to select, click canvas to place. WASD to pan. Click placed tiles to select/drag. DEL to delete. Ctrl+Z undo, Ctrl+Shift+Z redo. ESC to exit.';
    helpSection.appendChild(helpText);
    sidebar.appendChild(helpSection);

    this.uiRoot.appendChild(sidebar);
    document.body.appendChild(this.uiRoot);
  }

  private el<K extends keyof HTMLElementTagNameMap = 'div'>(
    tag: K, className: string
  ): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  private createCtrlBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = this.el('button', [
      'w-6 h-6 flex items-center justify-center rounded',
      'bg-panel-button border border-brd text-txt-primary text-xs',
      'hover:bg-brd-bright hover:border-brd-bright transition-colors select-none',
    ].join(' ')) as HTMLButtonElement;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private buildAssetGrid(container: HTMLElement): void {
    // Group assets by texture
    const groups = new Map<string, { label: string; assets: BuilderAssetDefinition[] }>();

    for (const asset of BUILDER_ASSETS) {
      const groupKey = asset.texture;
      if (!groups.has(groupKey)) {
        // Derive group label from asset label (strip trailing number)
        const groupLabel = asset.label.replace(/\s*\d+$/, '').toUpperCase() || asset.label.toUpperCase();
        groups.set(groupKey, { label: groupLabel, assets: [] });
      }
      groups.get(groupKey)!.assets.push(asset);
    }

    for (const [, group] of groups) {
      const section = this.el('div', 'mb-3');

      const header = this.el('span', 'text-[10px] font-mono text-txt-muted tracking-wider');
      header.textContent = group.label;
      section.appendChild(header);

      const grid = this.el('div', 'flex flex-wrap gap-1 mt-1');

      for (const asset of group.assets) {
        const item = this.el('div', [
          'w-9 h-9 flex items-center justify-center rounded cursor-pointer',
          'transition-all duration-150 select-none overflow-hidden',
          asset.id === this.selectedAsset.id
            ? 'border-2 border-accent'
            : 'border border-brd hover:border-accent/60',
        ].join(' '));
        item.dataset.assetId = asset.id;
        item.title = asset.label;

        const thumb = this.createTileThumb(asset, 32);
        item.appendChild(thumb);

        item.addEventListener('click', () => this.selectAsset(asset));
        grid.appendChild(item);
        this.assetItems.push(item);
      }

      section.appendChild(grid);
      container.appendChild(section);
    }
  }

  private createTileThumb(asset: BuilderAssetDefinition, size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.imageRendering = 'pixelated';

    const frame = this.textures.getFrame(asset.texture, asset.frame ?? 0);
    const ctx = canvas.getContext('2d')!;
    const src = frame.source.image as HTMLImageElement;

    const scale = Math.min(size / frame.cutWidth, size / frame.cutHeight);
    const dw = frame.cutWidth * scale;
    const dh = frame.cutHeight * scale;

    ctx.drawImage(
      src,
      frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      (size - dw) / 2, (size - dh) / 2, dw, dh
    );

    return canvas;
  }

  private updateAssetListHighlight(): void {
    this.assetItems.forEach((item) => {
      const isActive = item.dataset.assetId === this.selectedAsset.id;
      item.className = [
        'w-9 h-9 flex items-center justify-center rounded cursor-pointer',
        'transition-all duration-150 select-none overflow-hidden',
        isActive
          ? 'border-2 border-accent'
          : 'border border-brd hover:border-accent/60',
      ].join(' ');
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Placement preview                                                  */
  /* ------------------------------------------------------------------ */

  private createPlacementPreview(): void {
    this.placementPreview = this.add.image(0, 0, this.selectedAsset.texture, this.selectedAsset.frame)
      .setScale(this.selectedAsset.scale)
      .setAlpha(0.45)
      .setDepth(900);

    this.placementPreviewCollider = this.add.rectangle(0, 0, this.colliderWidth, this.colliderHeight)
      .setStrokeStyle(2, 0x68d391, 0.7)
      .setFillStyle(0x68d391, 0.1)
      .setDepth(901);
  }

  private refreshPlacementPreview(): void {
    if (!this.placementPreview || !this.placementPreviewCollider) return;

    this.placementPreview.setTexture(this.selectedAsset.texture, this.selectedAsset.frame);
    this.placementPreview.setScale(this.selectedAsset.scale);
    this.placementPreviewCollider.setDisplaySize(this.colliderWidth, this.colliderHeight);
  }

  /* ------------------------------------------------------------------ */
  /*  Input                                                              */
  /* ------------------------------------------------------------------ */

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

    // Undo / Redo shortcuts (Ctrl+Z / Ctrl+Shift+Z)
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.Z).on('down', () => {
      const ctrl = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL, false, false);
      const meta = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ALT, false, false);
      if (!ctrl.isDown && !meta.isDown) return;
      const shift = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false, false);
      if (shift.isDown) {
        this.redo();
      } else {
        this.undo();
      }
    });

    // Trackpad / mouse wheel to scroll the camera (both axes)
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.scrollX = Phaser.Math.Clamp(cam.scrollX + dx, 0, this.level.WORLD_WIDTH - cam.width);
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY + dy, 0, this.level.WORLD_HEIGHT - cam.height);
    });

    // Click on canvas to place a tile (only if no interactive object was clicked)
    this.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (currentlyOver.length > 0) return;
        this.isPainting = true;
        this.paintBatchTileIds = [];
        const point = this.getSnappedPoint(pointer);
        this.lastDragPlaceKey = `${point.x},${point.y}`;
        this.placeAsset(this.selectedAsset, point.x, point.y);
      }
    );

    // Drag while holding mouse to continuously place tiles
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.isPainting) return;
      const point = this.getSnappedPoint(pointer);
      const key = `${point.x},${point.y}`;
      if (key === this.lastDragPlaceKey) return;
      this.lastDragPlaceKey = key;
      this.placeAsset(this.selectedAsset, point.x, point.y);
    });

    this.input.on('pointerup', () => {
      // Flush paint batch as a single undo action
      if (this.isPainting && this.paintBatchTileIds.length > 0) {
        const batchIds = [...this.paintBatchTileIds];
        const snapshots = batchIds.map((id) => {
          const pa = this.placedAssets.find((a) => a.tileId === id)!;
          return {
            id,
            assetId: pa.asset.id,
            x: pa.sprite.x,
            y: pa.sprite.y,
            colliderWidth: pa.collider.displayWidth,
            colliderHeight: pa.collider.displayHeight,
          } as PlacedTileData;
        });
        this.pushAction({
          undo: () => {
            for (const snap of snapshots) {
              const found = this.placedAssets.find((a) => a.tileId === snap.id);
              if (found) this.deletePlacedAsset(found, false);
            }
          },
          redo: () => {
            for (const snap of snapshots) {
              restoreLevelTile(snap);
              this.placeAsset(getBuilderAssetById(snap.assetId), snap.x, snap.y, snap, false);
            }
          },
        });
      }
      this.paintBatchTileIds = [];
      this.lastDragPlaceKey = undefined;
      this.isPainting = false;
    });

    // Drag placed tiles to reposition — track start position
    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const placedAsset = gameObject.getData('placedAsset') as PlacedAsset | undefined;
      if (placedAsset) {
        this.dragStartPos = { x: placedAsset.sprite.x, y: placedAsset.sprite.y };
      }
    });

    this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const placedAsset = gameObject.getData('placedAsset') as PlacedAsset | undefined;
      if (!placedAsset) return;

      const point = this.getSnappedPoint(_pointer);
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

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const placedAsset = gameObject.getData('placedAsset') as PlacedAsset | undefined;
      if (!placedAsset || !this.dragStartPos) return;

      const from = this.dragStartPos;
      const to = { x: placedAsset.sprite.x, y: placedAsset.sprite.y };
      this.dragStartPos = undefined;

      if (from.x === to.x && from.y === to.y) return;

      const tileId = placedAsset.tileId;
      this.pushAction({
        undo: () => {
          const found = this.placedAssets.find((a) => a.tileId === tileId);
          if (!found) return;
          found.sprite.setPosition(from.x, from.y);
          found.collider.setPosition(from.x, from.y);
          this.updateStaticBody(found.sprite, found.collider.displayWidth, found.collider.displayHeight);
          this.layoutDeleteButton(found);
          updateLevelTile(tileId, { x: from.x, y: from.y });
        },
        redo: () => {
          const found = this.placedAssets.find((a) => a.tileId === tileId);
          if (!found) return;
          found.sprite.setPosition(to.x, to.y);
          found.collider.setPosition(to.x, to.y);
          this.updateStaticBody(found.sprite, found.collider.displayWidth, found.collider.displayHeight);
          this.layoutDeleteButton(found);
          updateLevelTile(tileId, { x: to.x, y: to.y });
        },
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Tile management                                                    */
  /* ------------------------------------------------------------------ */

  private loadPlacedTiles(): void {
    getLevelTiles().forEach((tile) => {
      this.placeAsset(getBuilderAssetById(tile.assetId), tile.x, tile.y, tile, false);
    });
  }

  private placeAsset(
    asset: BuilderAssetDefinition,
    x: number,
    y: number,
    existingTile?: PlacedTileData,
    recordAction = true
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

    if (recordAction && !this.isPainting) {
      // Single-click place: push immediately
      const tileId = tileData.id;
      this.pushAction({
        undo: () => {
          const found = this.placedAssets.find((a) => a.tileId === tileId);
          if (found) this.deletePlacedAsset(found, false);
        },
        redo: () => {
          restoreLevelTile(tileData);
          this.placeAsset(asset, tileData.x, tileData.y, tileData, false);
        },
      });
    } else if (recordAction && this.isPainting) {
      // Painting: collect tile IDs, batch action pushed on pointerup
      this.paintBatchTileIds.push(tileData.id);
    }
  }

  private createDeleteButton(): Phaser.GameObjects.Container {
    const background = this.add.circle(0, 0, 12, 0x9b2c2c, 1)
      .setStrokeStyle(2, 0xfbd38d, 1);
    const label = this.add.text(0, -1, '\u2715', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#fff5f5',
    }).setOrigin(0.5);

    const button = this.add.container(0, 0, [background, label])
      .setDepth(999)
      .setSize(24, 24)
      .setInteractive(new Phaser.Geom.Circle(0, 0, 14), Phaser.Geom.Circle.Contains);

    button.on('pointerover', () => {
      background.setFillStyle(0xc53030, 1);
      background.setScale(1.15);
      label.setScale(1.15);
    });
    button.on('pointerout', () => {
      background.setFillStyle(0x9b2c2c, 1);
      background.setScale(1);
      label.setScale(1);
    });

    button.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
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

  /* ------------------------------------------------------------------ */
  /*  Selection & controls                                               */
  /* ------------------------------------------------------------------ */

  private selectAsset(asset: BuilderAssetDefinition): void {
    this.selectedAsset = asset;
    this.colliderWidth = asset.defaultColliderWidth;
    this.colliderHeight = asset.defaultColliderHeight;
    this.selectedPlacedAsset = undefined;
    this.updateAssetListHighlight();
    this.refreshPlacedHighlights();
    this.refreshHud();
    this.refreshPlacementPreview();
  }

  private syncColliderControlsFromPlacedAsset(placedAsset: PlacedAsset): void {
    this.selectedAsset = placedAsset.asset;
    this.colliderWidth = placedAsset.collider.displayWidth;
    this.colliderHeight = placedAsset.collider.displayHeight;
    this.updateAssetListHighlight();
    this.refreshHud();
    this.refreshPlacementPreview();
  }

  private adjustColliderWidth(amount: number): void {
    const oldWidth = this.colliderWidth;
    this.colliderWidth = Math.max(this.gridSize, this.colliderWidth + amount);
    const newWidth = this.colliderWidth;
    if (this.selectedPlacedAsset) {
      const tileId = this.selectedPlacedAsset.tileId;
      this.applyColliderSize(this.selectedPlacedAsset, newWidth, this.selectedPlacedAsset.collider.displayHeight);
      this.pushAction({
        undo: () => {
          this.colliderWidth = oldWidth;
          const found = this.placedAssets.find((a) => a.tileId === tileId);
          if (found) this.applyColliderSize(found, oldWidth, found.collider.displayHeight);
          this.refreshHud();
          this.refreshPlacementPreview();
        },
        redo: () => {
          this.colliderWidth = newWidth;
          const found = this.placedAssets.find((a) => a.tileId === tileId);
          if (found) this.applyColliderSize(found, newWidth, found.collider.displayHeight);
          this.refreshHud();
          this.refreshPlacementPreview();
        },
      });
    }
    this.refreshHud();
    this.refreshPlacementPreview();
  }

  private adjustColliderHeight(amount: number): void {
    const oldHeight = this.colliderHeight;
    this.colliderHeight = Math.max(this.gridSize, this.colliderHeight + amount);
    const newHeight = this.colliderHeight;
    if (this.selectedPlacedAsset) {
      const tileId = this.selectedPlacedAsset.tileId;
      this.applyColliderSize(this.selectedPlacedAsset, this.selectedPlacedAsset.collider.displayWidth, newHeight);
      this.pushAction({
        undo: () => {
          this.colliderHeight = oldHeight;
          const found = this.placedAssets.find((a) => a.tileId === tileId);
          if (found) this.applyColliderSize(found, found.collider.displayWidth, oldHeight);
          this.refreshHud();
          this.refreshPlacementPreview();
        },
        redo: () => {
          this.colliderHeight = newHeight;
          const found = this.placedAssets.find((a) => a.tileId === tileId);
          if (found) this.applyColliderSize(found, found.collider.displayWidth, newHeight);
          this.refreshHud();
          this.refreshPlacementPreview();
        },
      });
    }
    this.refreshHud();
    this.refreshPlacementPreview();
  }

  private applyColliderSize(placedAsset: PlacedAsset, w: number, h: number): void {
    placedAsset.collider.setSize(w, h);
    placedAsset.collider.setDisplaySize(w, h);
    this.updateStaticBody(placedAsset.sprite, w, h);
    this.layoutDeleteButton(placedAsset);
    updateLevelTile(placedAsset.tileId, { colliderWidth: w, colliderHeight: h });
  }

  private refreshHud(): void {
    this.selectedLabel.textContent = this.selectedAsset.label;
    this.colliderLabel.textContent = `${this.colliderWidth} x ${this.colliderHeight}`;
    this.widthValueEl.textContent = String(this.colliderWidth);
    this.heightValueEl.textContent = String(this.colliderHeight);
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

  /* ------------------------------------------------------------------ */
  /*  Undo / Redo                                                        */
  /* ------------------------------------------------------------------ */

  private pushAction(action: UndoAction): void {
    this.undoStack.push(action);
    this.redoStack.length = 0;
    this.refreshUndoRedoButtons();
  }

  private undo(): void {
    const action = this.undoStack.pop();
    if (!action) return;
    action.undo();
    this.redoStack.push(action);
    this.refreshUndoRedoButtons();
  }

  private redo(): void {
    const action = this.redoStack.pop();
    if (!action) return;
    action.redo();
    this.undoStack.push(action);
    this.refreshUndoRedoButtons();
  }

  private refreshUndoRedoButtons(): void {
    this.undoBtn.disabled = this.undoStack.length === 0;
    this.redoBtn.disabled = this.redoStack.length === 0;
  }

  /* ------------------------------------------------------------------ */
  /*  Delete & exit                                                      */
  /* ------------------------------------------------------------------ */

  private deleteSelectedTile(): void {
    if (this.selectedPlacedAsset) {
      this.deletePlacedAsset(this.selectedPlacedAsset);
    }
  }

  private deletePlacedAsset(placedAsset: PlacedAsset, recordAction = true): void {
    const snapshot: PlacedTileData = {
      id: placedAsset.tileId,
      assetId: placedAsset.asset.id,
      x: placedAsset.sprite.x,
      y: placedAsset.sprite.y,
      colliderWidth: placedAsset.collider.displayWidth,
      colliderHeight: placedAsset.collider.displayHeight,
    };

    deleteLevelTile(placedAsset.tileId);
    placedAsset.sprite.destroy();
    placedAsset.collider.destroy();
    placedAsset.deleteButton.destroy();
    this.placedAssets = this.placedAssets.filter((item) => item.tileId !== placedAsset.tileId);

    if (this.selectedPlacedAsset?.tileId === placedAsset.tileId) {
      this.selectedPlacedAsset = undefined;
    }

    this.refreshPlacedHighlights();

    if (recordAction) {
      this.pushAction({
        undo: () => {
          restoreLevelTile(snapshot);
          this.placeAsset(getBuilderAssetById(snapshot.assetId), snapshot.x, snapshot.y, snapshot, false);
        },
        redo: () => {
          const found = this.placedAssets.find((a) => a.tileId === snapshot.id);
          if (found) this.deletePlacedAsset(found, false);
        },
      });
    }
  }

  private exitToGame(): void {
    this.scene.start('Game');
  }

  private getSnappedPoint(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return {
      x: Phaser.Math.Snap.To(pointer.worldX, this.gridSize),
      y: Phaser.Math.Snap.To(pointer.worldY, this.gridSize),
    };
  }
}
