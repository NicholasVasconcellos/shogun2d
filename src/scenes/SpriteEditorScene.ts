import Phaser from 'phaser';
import {
  ColliderConfig,
  getColliderConfig,
  setColliderConfig,
  saveColliderConfig,
  resetColliderConfig,
} from '../player/colliderState';

interface SheetEntry {
  key: string;
  textureKey: string;
  frameCount: number;
  animKey?: string;
}

export class SpriteEditorScene extends Phaser.Scene {
  private readonly panelWidth = 260;
  private readonly displayScale = 3;

  private spritePreview!: Phaser.GameObjects.Sprite;
  private overlay!: Phaser.GameObjects.Graphics;
  private boundsOutline!: Phaser.GameObjects.Graphics;

  private config!: ColliderConfig;
  private sheets: SheetEntry[] = [];
  private currentSheet!: SheetEntry;
  private currentFrame = 0;
  private isPlaying = true;

  private valueTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private frameText!: Phaser.GameObjects.Text;
  private playPauseText!: Phaser.GameObjects.Text;
  private animListItems: Array<{
    bg: Phaser.GameObjects.Rectangle;
    entry: SheetEntry;
  }> = [];

  private rectControls: Phaser.GameObjects.GameObject[] = [];
  private circleControls: Phaser.GameObjects.GameObject[] = [];

  private listScrollY = 0;
  private listContentHeight = 0;
  private readonly listTop = 50;
  private readonly listItemHeight = 26;

  constructor() {
    super({ key: 'SpriteEditor' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0d1117);
    this.config = getColliderConfig();

    this.buildSheetList();
    this.currentSheet = this.sheets[0];

    this.createAnimList();
    this.createPreview();
    this.createControls();
    this.createActionButtons();
    this.registerInput();

    this.redrawOverlay();
    this.updateAnimListHighlight();
  }

  update(): void {
    if (this.isPlaying && this.currentSheet.animKey) {
      this.currentFrame = this.spritePreview.anims.currentFrame
        ? this.spritePreview.anims.currentFrame.index
        : 0;
      this.frameText.setText(`Frame: ${this.currentFrame} / ${this.currentSheet.frameCount - 1}`);
    }
    this.redrawOverlay();
  }

  private buildSheetList(): void {
    const samuraiSheets: Record<string, number> = {
      'idle': 10, 'run': 16, 'walk': 12, 'jump': 3,
      'jump-start': 3, 'jump-fall': 3, 'jump-transition': 3,
      'dash': 8, 'attack-1': 7, 'attack-2': 7, 'attack-3': 6,
      'air-attack': 6, 'death': 9, 'hurt': 4, 'defend': 6,
      'wall-slide': 3, 'wall-contact': 3, 'wall-jump': 3,
      'climbing': 8, 'healing': 15, 'healing-no-effect': 15,
      'special-attack': 14, 'throw': 7,
    };

    const animMap: Record<string, string> = {
      'idle': 'player-idle',
      'run': 'player-run',
      'walk': 'player-walk',
      'jump': 'player-jump',
      'jump-start': 'player-jump-start',
      'jump-fall': 'player-fall',
      'dash': 'player-dash',
      'wall-slide': 'player-wall-slide',
      'attack-1': 'player-attack-1',
      'hurt': 'player-hurt',
    };

    for (const [key, frameCount] of Object.entries(samuraiSheets)) {
      this.sheets.push({
        key,
        textureKey: `samurai-${key}`,
        frameCount,
        animKey: animMap[key],
      });
    }
  }

  private createAnimList(): void {
    const cam = this.cameras.main;
    const listHeight = cam.height - this.listTop - 10;

    // Panel background
    this.add.rectangle(0, 0, this.panelWidth, cam.height, 0x11151c, 0.94)
      .setOrigin(0, 0)
      .setDepth(1000)
      .setStrokeStyle(2, 0x314355, 1);

    // Title
    this.add.text(12, 14, 'Sprite Editor', {
      fontSize: '18px',
      color: '#f0f4f8',
    }).setDepth(1100);

    // Mask for scrollable list
    const maskGraphics = this.add.graphics().setDepth(1002);
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(0, this.listTop, this.panelWidth, listHeight);
    const mask = maskGraphics.createGeometryMask();

    this.sheets.forEach((entry, i) => {
      const y = this.listTop + i * this.listItemHeight;

      const bg = this.add.rectangle(0, y, this.panelWidth - 4, this.listItemHeight - 2, 0x1b2530, 1)
        .setOrigin(0, 0)
        .setDepth(1003)
        .setInteractive({ useHandCursor: true });
      bg.setMask(mask);

      const label = this.add.text(10, y + 5, entry.key, {
        fontSize: '12px',
        color: '#d9e2ec',
      }).setDepth(1004);
      label.setMask(mask);

      const frameCountText = this.add.text(this.panelWidth - 30, y + 5, `${entry.frameCount}f`, {
        fontSize: '10px',
        color: '#829ab1',
      }).setDepth(1004);
      frameCountText.setMask(mask);

      bg.on('pointerdown', () => this.selectSheet(entry));

      this.animListItems.push({ bg, entry });
    });

    this.listContentHeight = this.sheets.length * this.listItemHeight;

    // Scroll
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objs: unknown[], _dx: number, dy: number) => {
      if (pointer.x > this.panelWidth || pointer.y < this.listTop) return;
      const maxScroll = Math.max(0, this.listContentHeight - (cam.height - this.listTop - 10));
      this.listScrollY = Phaser.Math.Clamp(this.listScrollY + dy * 0.5, 0, maxScroll);
      this.layoutAnimList();
    });
  }

  private layoutAnimList(): void {
    this.animListItems.forEach(({ bg }, i) => {
      const y = this.listTop + i * this.listItemHeight - this.listScrollY;
      bg.setPosition(0, y);
      // Move associated text objects too (they're children in rendering)
      const label = bg.parentContainer?.list?.[1] as Phaser.GameObjects.Text | undefined;
      if (label) label.setPosition(10, y + 5);
    });
    // Simpler: just offset all items by repositioning bg
    // Text objects are independent, so we need to track them. Let's just rebuild positions.
  }

  private createPreview(): void {
    const cam = this.cameras.main;
    const centerX = this.panelWidth + (cam.width - this.panelWidth) / 2;
    const centerY = cam.height * 0.45;

    this.spritePreview = this.add.sprite(centerX, centerY, this.sheets[0].textureKey)
      .setScale(this.displayScale)
      .setDepth(10);

    if (this.sheets[0].animKey) {
      this.spritePreview.play(this.sheets[0].animKey);
    }

    // Graphics layers
    this.boundsOutline = this.add.graphics().setDepth(9);
    this.overlay = this.add.graphics().setDepth(11);

    // Ground reference line
    this.add.graphics()
      .setDepth(8)
      .lineStyle(1, 0xe85d04, 0.4)
      .lineBetween(this.panelWidth, centerY + 96 * this.displayScale / 2, cam.width, centerY + 96 * this.displayScale / 2);

    // Ground label
    this.add.text(this.panelWidth + 8, centerY + 96 * this.displayScale / 2 + 4, 'ground level', {
      fontSize: '10px',
      color: '#e85d04',
    }).setAlpha(0.6).setDepth(8);
  }

  private createControls(): void {
    const cam = this.cameras.main;
    const controlX = this.panelWidth + 20;
    const controlY = cam.height * 0.75;
    let y = controlY;

    // ---- Collider Type Toggle ----
    this.add.text(controlX, y, 'Collider Type:', {
      fontSize: '12px', color: '#bcccdc',
    }).setDepth(100);

    const rectBtn = this.createToggleButton(controlX + 110, y - 2, 'RECT', () => {
      this.config.type = 'rectangle';
      this.updateTypeToggle();
      this.updateControlVisibility();
      this.redrawOverlay();
    });

    const circBtn = this.createToggleButton(controlX + 170, y - 2, 'CIRCLE', () => {
      this.config.type = 'circle';
      this.updateTypeToggle();
      this.updateControlVisibility();
      this.redrawOverlay();
    });

    this.rectControls.push(rectBtn.bg); // just track for toggle highlight
    this.circleControls.push(circBtn.bg);

    y += 30;

    // ---- Rectangle controls ----
    const rectGroup: Phaser.GameObjects.GameObject[] = [];

    rectGroup.push(...this.createParamRow(controlX, y, 'Width', 'width', 1, 1, 96));
    y += 26;
    rectGroup.push(...this.createParamRow(controlX, y, 'Height', 'height', 1, 1, 96));
    y += 26;
    rectGroup.push(...this.createParamRow(controlX, y, 'Offset X', 'offsetX', 1, 0, 96));
    y += 26;
    rectGroup.push(...this.createParamRow(controlX, y, 'Offset Y', 'offsetY', 1, 0, 96));
    y += 26;

    this.rectControls.push(...rectGroup);

    // ---- Circle controls ----
    const circGroup: Phaser.GameObjects.GameObject[] = [];
    const circY = controlY + 30;

    circGroup.push(...this.createParamRow(controlX, circY, 'Radius', 'radius', 1, 1, 48));
    circGroup.push(...this.createParamRow(controlX, circY + 26, 'Offset X', 'circleOffsetX', 1, 0, 96));
    circGroup.push(...this.createParamRow(controlX, circY + 52, 'Offset Y', 'circleOffsetY', 1, 0, 96));

    this.circleControls.push(...circGroup);

    // ---- Scale (always visible) ----
    const scaleY = controlY + 30 + 26 * 4;
    this.createParamRow(controlX, scaleY, 'Scale', 'scale', 0.1, 0.1, 4, 1);

    // ---- Playback controls ----
    const playY = scaleY + 36;
    this.playPauseText = this.add.text(controlX, playY, '[ PAUSE ]', {
      fontSize: '12px', color: '#7fdbca',
    }).setDepth(100).setInteractive({ useHandCursor: true });
    this.playPauseText.on('pointerdown', () => this.togglePlayPause());

    this.add.text(controlX + 80, playY, '[ < ]', {
      fontSize: '12px', color: '#7fdbca',
    }).setDepth(100).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.stepFrame(-1));

    this.add.text(controlX + 110, playY, '[ > ]', {
      fontSize: '12px', color: '#7fdbca',
    }).setDepth(100).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.stepFrame(1));

    this.frameText = this.add.text(controlX + 150, playY, 'Frame: 0 / 0', {
      fontSize: '12px', color: '#829ab1',
    }).setDepth(100);

    // Initial visibility
    this.updateTypeToggle();
    this.updateControlVisibility();
  }

  private createToggleButton(
    x: number, y: number, label: string, onClick: () => void
  ): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
    const bg = this.add.rectangle(x, y, 50, 22, 0x243b53, 1)
      .setOrigin(0, 0)
      .setDepth(100)
      .setStrokeStyle(1, 0x486581, 1)
      .setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);

    const text = this.add.text(x + 25, y + 11, label, {
      fontSize: '11px', color: '#f0f4f8',
    }).setOrigin(0.5).setDepth(101);

    bg.setData('toggleLabel', label);
    return { bg, text };
  }

  private updateTypeToggle(): void {
    // Highlight active type button
    this.rectControls.forEach((obj) => {
      if (obj instanceof Phaser.GameObjects.Rectangle && obj.getData('toggleLabel') === 'RECT') {
        obj.setFillStyle(this.config.type === 'rectangle' ? 0xe85d04 : 0x243b53, 1);
      }
    });
    this.circleControls.forEach((obj) => {
      if (obj instanceof Phaser.GameObjects.Rectangle && obj.getData('toggleLabel') === 'CIRCLE') {
        obj.setFillStyle(this.config.type === 'circle' ? 0xe85d04 : 0x243b53, 1);
      }
    });
  }

  private updateControlVisibility(): void {
    const isRect = this.config.type === 'rectangle';
    this.rectControls.forEach((obj) => {
      if (obj instanceof Phaser.GameObjects.Rectangle && obj.getData('toggleLabel')) return;
      if ('setVisible' in obj) (obj as { setVisible(v: boolean): void }).setVisible(isRect);
    });
    this.circleControls.forEach((obj) => {
      if (obj instanceof Phaser.GameObjects.Rectangle && obj.getData('toggleLabel')) return;
      if ('setVisible' in obj) (obj as { setVisible(v: boolean): void }).setVisible(!isRect);
    });
  }

  private createParamRow(
    x: number, y: number, label: string, configKey: keyof ColliderConfig,
    step: number, min: number, max: number, decimals = 0
  ): Phaser.GameObjects.GameObject[] {
    const objects: Phaser.GameObjects.GameObject[] = [];

    const labelText = this.add.text(x, y + 2, label, {
      fontSize: '12px', color: '#bcccdc',
    }).setDepth(100);
    objects.push(labelText);

    const valueText = this.add.text(x + 100, y + 2, '', {
      fontSize: '12px', color: '#f0f4f8',
    }).setDepth(100);
    objects.push(valueText);
    this.valueTexts.set(configKey, valueText);
    this.updateValueText(configKey, decimals);

    const minusBtn = this.add.rectangle(x + 150, y, 24, 20, 0x243b53, 1)
      .setOrigin(0, 0).setDepth(100)
      .setStrokeStyle(1, 0x486581, 1)
      .setInteractive({ useHandCursor: true });
    minusBtn.on('pointerdown', () => {
      const val = Math.max(min, (this.config[configKey] as number) - step);
      (this.config as unknown as Record<string, number>)[configKey] = Math.round(val * 100) / 100;
      this.updateValueText(configKey, decimals);
      this.redrawOverlay();
    });
    objects.push(minusBtn);

    const minusLabel = this.add.text(x + 162, y + 10, '-', {
      fontSize: '14px', color: '#f0f4f8',
    }).setOrigin(0.5).setDepth(101);
    objects.push(minusLabel);

    const plusBtn = this.add.rectangle(x + 180, y, 24, 20, 0x243b53, 1)
      .setOrigin(0, 0).setDepth(100)
      .setStrokeStyle(1, 0x486581, 1)
      .setInteractive({ useHandCursor: true });
    plusBtn.on('pointerdown', () => {
      const val = Math.min(max, (this.config[configKey] as number) + step);
      (this.config as unknown as Record<string, number>)[configKey] = Math.round(val * 100) / 100;
      this.updateValueText(configKey, decimals);
      this.redrawOverlay();
    });
    objects.push(plusBtn);

    const plusLabel = this.add.text(x + 192, y + 10, '+', {
      fontSize: '14px', color: '#f0f4f8',
    }).setOrigin(0.5).setDepth(101);
    objects.push(plusLabel);

    return objects;
  }

  private updateValueText(configKey: keyof ColliderConfig, decimals = 0): void {
    const text = this.valueTexts.get(configKey);
    if (text) {
      const val = this.config[configKey] as number;
      text.setText(decimals > 0 ? val.toFixed(decimals) : String(val));
    }
  }

  private createActionButtons(): void {
    const cam = this.cameras.main;
    const btnY = cam.height - 40;
    const btnX = this.panelWidth + 20;

    this.createActionButton(btnX, btnY, 'APPLY & EXIT', 120, () => this.applyAndExit(), 0x22543d);
    this.createActionButton(btnX + 130, btnY, 'RESET', 80, () => this.resetConfig(), 0x742a2a);
    this.createActionButton(btnX + 220, btnY, 'CANCEL', 80, () => this.cancel(), 0x243b53);
  }

  private createActionButton(
    x: number, y: number, label: string, width: number,
    onClick: () => void, color: number
  ): void {
    const btn = this.add.rectangle(x, y, width, 28, color, 1)
      .setOrigin(0, 0).setDepth(100)
      .setStrokeStyle(1, 0x486581, 1)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', onClick);

    this.add.text(x + width / 2, y + 14, label, {
      fontSize: '12px', color: '#f0f4f8',
    }).setOrigin(0.5).setDepth(101);
  }

  private registerInput(): void {
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
      this.cancel();
    });

    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => {
      this.togglePlayPause();
    });

    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT).on('down', () => {
      this.stepFrame(-1);
    });

    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT).on('down', () => {
      this.stepFrame(1);
    });
  }

  private selectSheet(entry: SheetEntry): void {
    this.currentSheet = entry;
    this.currentFrame = 0;
    this.isPlaying = true;
    this.playPauseText.setText('[ PAUSE ]');

    if (entry.animKey) {
      this.spritePreview.play(entry.animKey);
    } else {
      this.spritePreview.stop();
      this.spritePreview.setTexture(entry.textureKey, 0);
      this.isPlaying = false;
      this.playPauseText.setText('[ PLAY ]');
    }

    this.frameText.setText(`Frame: 0 / ${entry.frameCount - 1}`);
    this.updateAnimListHighlight();
  }

  private updateAnimListHighlight(): void {
    this.animListItems.forEach(({ bg, entry }) => {
      bg.setFillStyle(entry.key === this.currentSheet.key ? 0xe85d04 : 0x1b2530, 1);
    });
  }

  private togglePlayPause(): void {
    if (!this.currentSheet.animKey) {
      // No registered animation, just scrub frames
      return;
    }

    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.spritePreview.play(this.currentSheet.animKey!);
      this.playPauseText.setText('[ PAUSE ]');
    } else {
      this.spritePreview.anims.pause();
      this.playPauseText.setText('[ PLAY ]');
    }
  }

  private stepFrame(dir: number): void {
    this.isPlaying = false;
    this.playPauseText.setText('[ PLAY ]');

    if (this.currentSheet.animKey && this.spritePreview.anims.isPlaying) {
      this.spritePreview.anims.pause();
    }

    this.currentFrame = Phaser.Math.Wrap(
      this.currentFrame + dir, 0, this.currentSheet.frameCount
    );
    this.spritePreview.setTexture(this.currentSheet.textureKey, this.currentFrame);
    this.frameText.setText(`Frame: ${this.currentFrame} / ${this.currentSheet.frameCount - 1}`);
  }

  private redrawOverlay(): void {
    this.overlay.clear();
    this.boundsOutline.clear();

    const s = this.config.scale;
    const ds = this.displayScale;
    const sx = this.spritePreview.x;
    const sy = this.spritePreview.y;

    // Sprite frame bounds (96x96 at displayScale)
    const halfW = (96 * ds) / 2;
    const halfH = (96 * ds) / 2;
    this.boundsOutline.lineStyle(1, 0x486581, 0.5);
    this.boundsOutline.strokeRect(sx - halfW, sy - halfH, 96 * ds, 96 * ds);

    // Collider overlay
    const topLeftX = sx - halfW;
    const topLeftY = sy - halfH;

    if (this.config.type === 'rectangle') {
      const w = this.config.width * s * ds;
      const h = this.config.height * s * ds;
      const ox = this.config.offsetX * ds;
      const oy = this.config.offsetY * ds;

      this.overlay.lineStyle(2, 0x19c37d, 1);
      this.overlay.fillStyle(0x19c37d, 0.18);
      this.overlay.fillRect(topLeftX + ox, topLeftY + oy, w, h);
      this.overlay.strokeRect(topLeftX + ox, topLeftY + oy, w, h);
    } else {
      const r = this.config.radius * s * ds;
      const ox = this.config.circleOffsetX * ds;
      const oy = this.config.circleOffsetY * ds;
      // Circle offset in Phaser is from top-left, center = offset + radius
      const cx = topLeftX + ox + r;
      const cy = topLeftY + oy + r;

      this.overlay.lineStyle(2, 0x19c37d, 1);
      this.overlay.fillStyle(0x19c37d, 0.18);
      this.overlay.fillCircle(cx, cy, r);
      this.overlay.strokeCircle(cx, cy, r);
    }

    // Crosshair at sprite center
    this.overlay.lineStyle(1, 0xe85d04, 0.4);
    this.overlay.lineBetween(sx - 12, sy, sx + 12, sy);
    this.overlay.lineBetween(sx, sy - 12, sx, sy + 12);
  }

  private applyAndExit(): void {
    setColliderConfig(this.config);
    saveColliderConfig();
    this.scene.start('Game');
  }

  private resetConfig(): void {
    resetColliderConfig();
    this.config = getColliderConfig();
    // Update all value displays
    this.valueTexts.forEach((_text, key) => {
      const decimals = key === 'scale' ? 1 : 0;
      this.updateValueText(key as keyof ColliderConfig, decimals);
    });
    this.updateTypeToggle();
    this.updateControlVisibility();
    this.redrawOverlay();
  }

  private cancel(): void {
    this.scene.start('Game');
  }
}
