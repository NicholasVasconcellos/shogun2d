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
  private readonly displayScale = 3;

  // Phaser canvas objects
  private spritePreview!: Phaser.GameObjects.Sprite;
  private overlay!: Phaser.GameObjects.Graphics;
  private boundsOutline!: Phaser.GameObjects.Graphics;

  // State
  private config!: ColliderConfig;
  private sheets: SheetEntry[] = [];
  private currentSheet!: SheetEntry;
  private currentFrame = 0;
  private isPlaying = true;

  // DOM references
  private uiRoot!: HTMLDivElement;
  private animItems: HTMLDivElement[] = [];
  private valueEls: Map<string, HTMLSpanElement> = new Map();
  private frameEl!: HTMLSpanElement;
  private playPauseBtn!: HTMLButtonElement;
  private typeRectBtn!: HTMLButtonElement;
  private typeCircleBtn!: HTMLButtonElement;
  private rectParamsEl!: HTMLDivElement;
  private circleParamsEl!: HTMLDivElement;

  constructor() {
    super({ key: 'SpriteEditor' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0d1117);
    this.config = getColliderConfig();

    this.buildSheetList();
    this.currentSheet = this.sheets[0];

    this.buildUI();
    this.createPreview();
    this.registerInput();

    this.redrawOverlay();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.uiRoot.remove();
      this.valueEls.clear();
      this.animItems = [];
    });
  }

  update(): void {
    if (this.isPlaying && this.currentSheet.animKey) {
      this.currentFrame = this.spritePreview.anims.currentFrame
        ? this.spritePreview.anims.currentFrame.index
        : 0;
      this.frameEl.textContent = `Frame ${this.currentFrame} / ${this.currentSheet.frameCount - 1}`;
    }
    this.redrawOverlay();
  }

  /* ------------------------------------------------------------------ */
  /*  Data                                                               */
  /* ------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------ */
  /*  HTML UI                                                            */
  /* ------------------------------------------------------------------ */

  private buildUI(): void {
    // Root overlay -- covers viewport, passes clicks through to canvas
    this.uiRoot = this.el('div', 'fixed inset-0 z-[1000] pointer-events-none font-sans');

    // ---- LEFT SIDEBAR ----
    const sidebar = this.el('div', [
      'pointer-events-auto absolute left-0 top-0 bottom-0 w-[260px]',
      'bg-panel-bg/[0.96] border-r border-brd flex flex-col',
      'backdrop-blur-sm',
    ].join(' '));

    // Sidebar header
    const header = this.el('div', 'px-4 pt-4 pb-3 border-b border-brd/60');
    const titleRow = this.el('div', 'flex items-center justify-between');
    const title = this.el('span', 'font-mono font-semibold text-sm tracking-widest text-accent');
    title.textContent = 'SPRITE EDITOR';
    const badge = this.el('span', 'font-mono text-[10px] text-txt-muted bg-panel-surface px-2 py-0.5 rounded');
    badge.textContent = `${this.sheets.length} sheets`;
    titleRow.append(title, badge);
    header.appendChild(titleRow);
    sidebar.appendChild(header);

    // Animation list
    const listContainer = this.el('div', 'flex-1 overflow-y-auto se-scroll py-1');
    this.sheets.forEach((entry, i) => {
      const item = this.el('div', [
        'flex items-center justify-between px-3 py-[7px] mx-1.5 rounded cursor-pointer',
        'transition-all duration-150',
        i === 0
          ? 'bg-accent/90 text-white'
          : 'text-txt-secondary hover:bg-panel-button/70',
      ].join(' '));
      item.dataset.index = String(i);

      const name = this.el('span', 'text-xs font-sans font-medium truncate');
      name.textContent = entry.key;

      const info = this.el('span', 'text-[10px] font-mono text-txt-muted ml-2 shrink-0');
      info.textContent = `${entry.frameCount}f`;

      if (entry.animKey) {
        const dot = this.el('span', 'w-1.5 h-1.5 rounded-full bg-success shrink-0 mr-2');
        item.appendChild(dot);
      } else {
        const dot = this.el('span', 'w-1.5 h-1.5 rounded-full bg-brd shrink-0 mr-2');
        item.appendChild(dot);
      }

      item.append(name, info);
      item.addEventListener('click', () => this.selectSheet(entry));
      listContainer.appendChild(item);
      this.animItems.push(item);
    });
    sidebar.appendChild(listContainer);

    // ---- BOTTOM DOCK ----
    const dock = this.el('div', [
      'pointer-events-auto absolute bottom-0 right-0 left-[260px]',
      'bg-panel-bg/[0.96] border-t border-brd backdrop-blur-sm',
      'px-5 py-4',
    ].join(' '));

    const dockInner = this.el('div', 'flex gap-6 items-start');

    // -- Col 1: Collider controls --
    const colControls = this.el('div', 'flex-1 min-w-0');

    // Type toggle
    const typeRow = this.el('div', 'flex items-center gap-2 mb-3');
    const typeLabel = this.el('span', 'text-xs font-sans text-txt-label mr-1');
    typeLabel.textContent = 'Collider';

    this.typeRectBtn = this.el('button', '') as HTMLButtonElement;
    this.typeRectBtn.textContent = 'RECT';
    this.typeRectBtn.addEventListener('click', () => {
      this.config.type = 'rectangle';
      this.updateTypeToggle();
      this.updateControlVisibility();
      this.redrawOverlay();
    });

    this.typeCircleBtn = this.el('button', '') as HTMLButtonElement;
    this.typeCircleBtn.textContent = 'CIRCLE';
    this.typeCircleBtn.addEventListener('click', () => {
      this.config.type = 'circle';
      this.updateTypeToggle();
      this.updateControlVisibility();
      this.redrawOverlay();
    });

    typeRow.append(typeLabel, this.typeRectBtn, this.typeCircleBtn);
    colControls.appendChild(typeRow);
    this.updateTypeToggle();

    // Rect params
    this.rectParamsEl = this.el('div', 'space-y-1');
    this.createParamRow(this.rectParamsEl, 'Width', 'width', 1, 1, 96);
    this.createParamRow(this.rectParamsEl, 'Height', 'height', 1, 1, 96);
    this.createParamRow(this.rectParamsEl, 'Offset X', 'offsetX', 1, 0, 96);
    this.createParamRow(this.rectParamsEl, 'Offset Y', 'offsetY', 1, 0, 96);
    colControls.appendChild(this.rectParamsEl);

    // Circle params
    this.circleParamsEl = this.el('div', 'space-y-1');
    this.createParamRow(this.circleParamsEl, 'Radius', 'radius', 1, 1, 48);
    this.createParamRow(this.circleParamsEl, 'Offset X', 'circleOffsetX', 1, 0, 96);
    this.createParamRow(this.circleParamsEl, 'Offset Y', 'circleOffsetY', 1, 0, 96);
    colControls.appendChild(this.circleParamsEl);

    // Scale (always visible)
    const scaleRow = this.el('div', 'mt-2 pt-2 border-t border-brd/40');
    this.createParamRow(scaleRow, 'Scale', 'scale', 0.1, 0.1, 4, 1);
    colControls.appendChild(scaleRow);

    this.updateControlVisibility();

    dockInner.appendChild(colControls);

    // -- Col 2: Playback --
    const colPlayback = this.el('div', 'flex flex-col items-center gap-2 pt-1');

    const playLabel = this.el('span', 'text-[10px] font-mono text-txt-muted tracking-wider');
    playLabel.textContent = 'PLAYBACK';
    colPlayback.appendChild(playLabel);

    const playRow = this.el('div', 'flex items-center gap-1.5');

    const prevBtn = this.el('button', [
      'w-8 h-8 flex items-center justify-center rounded',
      'bg-panel-button border border-brd text-txt-primary text-sm',
      'hover:bg-brd-bright hover:border-brd-bright transition-colors',
    ].join(' ')) as HTMLButtonElement;
    prevBtn.innerHTML = '&#9664;';
    prevBtn.addEventListener('click', () => this.stepFrame(-1));

    this.playPauseBtn = this.el('button', [
      'w-20 h-8 flex items-center justify-center rounded',
      'bg-panel-button border border-cyan/40 text-cyan text-xs font-mono font-medium',
      'hover:bg-cyan/10 hover:border-cyan/60 transition-colors',
    ].join(' ')) as HTMLButtonElement;
    this.playPauseBtn.textContent = 'PAUSE';
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());

    const nextBtn = this.el('button', [
      'w-8 h-8 flex items-center justify-center rounded',
      'bg-panel-button border border-brd text-txt-primary text-sm',
      'hover:bg-brd-bright hover:border-brd-bright transition-colors',
    ].join(' ')) as HTMLButtonElement;
    nextBtn.innerHTML = '&#9654;';
    nextBtn.addEventListener('click', () => this.stepFrame(1));

    playRow.append(prevBtn, this.playPauseBtn, nextBtn);
    colPlayback.appendChild(playRow);

    this.frameEl = this.el('span', 'text-[11px] font-mono text-txt-muted') as HTMLSpanElement;
    this.frameEl.textContent = `Frame 0 / ${this.currentSheet.frameCount - 1}`;
    colPlayback.appendChild(this.frameEl);

    dockInner.appendChild(colPlayback);

    // -- Col 3: Actions --
    const colActions = this.el('div', 'flex flex-col gap-2 ml-auto pt-1');

    const applyBtn = this.el('button', [
      'px-5 h-9 rounded font-sans text-xs font-medium',
      'bg-success-dark border border-success/40 text-success',
      'hover:bg-success/20 hover:border-success/60 transition-colors',
    ].join(' ')) as HTMLButtonElement;
    applyBtn.textContent = 'APPLY & EXIT';
    applyBtn.addEventListener('click', () => this.applyAndExit());

    const resetBtn = this.el('button', [
      'px-5 h-8 rounded font-sans text-xs font-medium',
      'bg-danger/80 border border-accent/30 text-accent',
      'hover:bg-danger hover:border-accent/50 transition-colors',
    ].join(' ')) as HTMLButtonElement;
    resetBtn.textContent = 'RESET';
    resetBtn.addEventListener('click', () => this.resetConfig());

    const cancelBtn = this.el('button', [
      'px-5 h-8 rounded font-sans text-xs font-medium',
      'bg-panel-button border border-brd text-txt-primary',
      'hover:bg-brd-bright transition-colors',
    ].join(' ')) as HTMLButtonElement;
    cancelBtn.textContent = 'CANCEL';
    cancelBtn.addEventListener('click', () => this.cancel());

    colActions.append(applyBtn, resetBtn, cancelBtn);
    dockInner.appendChild(colActions);

    dock.appendChild(dockInner);

    // Assemble
    this.uiRoot.append(sidebar, dock);
    document.body.appendChild(this.uiRoot);
  }

  /** Utility: create a typed element with Tailwind classes */
  private el<K extends keyof HTMLElementTagNameMap = 'div'>(
    tag: K, className: string
  ): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  private createParamRow(
    parent: HTMLElement, label: string, configKey: keyof ColliderConfig,
    step: number, min: number, max: number, decimals = 0
  ): void {
    const row = this.el('div', 'flex items-center gap-2');

    const labelEl = this.el('span', 'text-[11px] font-sans text-txt-label w-16 shrink-0');
    labelEl.textContent = label;

    const minusBtn = this.el('button', [
      'w-6 h-6 flex items-center justify-center rounded',
      'bg-panel-button border border-brd text-txt-primary text-xs',
      'hover:bg-brd-bright hover:border-brd-bright transition-colors select-none',
    ].join(' ')) as HTMLButtonElement;
    minusBtn.textContent = '\u2212';
    minusBtn.addEventListener('click', () => {
      const val = Math.max(min, (this.config[configKey] as number) - step);
      (this.config as unknown as Record<string, number>)[configKey] = Math.round(val * 100) / 100;
      this.updateValueDisplay(configKey, decimals);
      this.redrawOverlay();
    });

    const valueEl = this.el('span', 'text-xs font-mono text-txt-primary w-10 text-center');
    this.valueEls.set(configKey, valueEl);
    this.updateValueDisplay(configKey, decimals);

    const plusBtn = this.el('button', [
      'w-6 h-6 flex items-center justify-center rounded',
      'bg-panel-button border border-brd text-txt-primary text-xs',
      'hover:bg-brd-bright hover:border-brd-bright transition-colors select-none',
    ].join(' ')) as HTMLButtonElement;
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', () => {
      const val = Math.min(max, (this.config[configKey] as number) + step);
      (this.config as unknown as Record<string, number>)[configKey] = Math.round(val * 100) / 100;
      this.updateValueDisplay(configKey, decimals);
      this.redrawOverlay();
    });

    row.append(labelEl, minusBtn, valueEl, plusBtn);
    parent.appendChild(row);
  }

  private updateValueDisplay(configKey: keyof ColliderConfig, decimals = 0): void {
    const el = this.valueEls.get(configKey);
    if (el) {
      const val = this.config[configKey] as number;
      el.textContent = decimals > 0 ? val.toFixed(decimals) : String(val);
    }
  }

  private updateTypeToggle(): void {
    const activeClasses = 'px-3 py-1 rounded text-[11px] font-mono font-medium transition-colors bg-accent text-white border border-accent';
    const inactiveClasses = 'px-3 py-1 rounded text-[11px] font-mono font-medium transition-colors bg-panel-button text-txt-muted border border-brd hover:bg-brd-bright';

    this.typeRectBtn.className = this.config.type === 'rectangle' ? activeClasses : inactiveClasses;
    this.typeCircleBtn.className = this.config.type === 'circle' ? activeClasses : inactiveClasses;
  }

  private updateControlVisibility(): void {
    const isRect = this.config.type === 'rectangle';
    this.rectParamsEl.classList.toggle('hidden', !isRect);
    this.circleParamsEl.classList.toggle('hidden', isRect);
  }

  private updateAnimListHighlight(): void {
    this.animItems.forEach((item, i) => {
      const entry = this.sheets[i];
      const isActive = entry.key === this.currentSheet.key;
      // Reset classes
      item.className = [
        'flex items-center justify-between px-3 py-[7px] mx-1.5 rounded cursor-pointer',
        'transition-all duration-150',
        isActive
          ? 'bg-accent/90 text-white'
          : 'text-txt-secondary hover:bg-panel-button/70',
      ].join(' ');

      // Update the info span color
      const info = item.querySelector('span:last-child') as HTMLSpanElement;
      if (info) info.className = `text-[10px] font-mono ml-2 shrink-0 ${isActive ? 'text-white/70' : 'text-txt-muted'}`;
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Phaser canvas (preview + overlay)                                  */
  /* ------------------------------------------------------------------ */

  private createPreview(): void {
    const cam = this.cameras.main;
    const centerX = cam.width / 2;
    const centerY = cam.height * 0.45;

    this.spritePreview = this.add.sprite(centerX, centerY, this.sheets[0].textureKey)
      .setScale(this.displayScale)
      .setDepth(10);

    if (this.sheets[0].animKey) {
      this.spritePreview.play(this.sheets[0].animKey);
    }

    this.boundsOutline = this.add.graphics().setDepth(9);
    this.overlay = this.add.graphics().setDepth(11);

    // Ground reference line
    this.add.graphics()
      .setDepth(8)
      .lineStyle(1, 0xe85d04, 0.4)
      .lineBetween(0, centerY + 96 * this.displayScale / 2, cam.width, centerY + 96 * this.displayScale / 2);

    this.add.text(8, centerY + 96 * this.displayScale / 2 + 4, 'ground level', {
      fontSize: '10px',
      color: '#e85d04',
    }).setAlpha(0.6).setDepth(8);
  }

  private redrawOverlay(): void {
    this.overlay.clear();
    this.boundsOutline.clear();

    const s = this.config.scale;
    const ds = this.displayScale;
    const sx = this.spritePreview.x;
    const sy = this.spritePreview.y;

    const halfW = (96 * ds) / 2;
    const halfH = (96 * ds) / 2;
    this.boundsOutline.lineStyle(1, 0x486581, 0.5);
    this.boundsOutline.strokeRect(sx - halfW, sy - halfH, 96 * ds, 96 * ds);

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

  /* ------------------------------------------------------------------ */
  /*  Interaction                                                        */
  /* ------------------------------------------------------------------ */

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
    this.playPauseBtn.textContent = 'PAUSE';

    if (entry.animKey) {
      this.spritePreview.play(entry.animKey);
    } else {
      this.spritePreview.stop();
      this.spritePreview.setTexture(entry.textureKey, 0);
      this.isPlaying = false;
      this.playPauseBtn.textContent = 'PLAY';
    }

    this.frameEl.textContent = `Frame 0 / ${entry.frameCount - 1}`;
    this.updateAnimListHighlight();
  }

  private togglePlayPause(): void {
    if (!this.currentSheet.animKey) return;

    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.spritePreview.play(this.currentSheet.animKey!);
      this.playPauseBtn.textContent = 'PAUSE';
    } else {
      this.spritePreview.anims.pause();
      this.playPauseBtn.textContent = 'PLAY';
    }
  }

  private stepFrame(dir: number): void {
    this.isPlaying = false;
    this.playPauseBtn.textContent = 'PLAY';

    if (this.currentSheet.animKey && this.spritePreview.anims.isPlaying) {
      this.spritePreview.anims.pause();
    }

    this.currentFrame = Phaser.Math.Wrap(
      this.currentFrame + dir, 0, this.currentSheet.frameCount
    );
    this.spritePreview.setTexture(this.currentSheet.textureKey, this.currentFrame);
    this.frameEl.textContent = `Frame ${this.currentFrame} / ${this.currentSheet.frameCount - 1}`;
  }

  /* ------------------------------------------------------------------ */
  /*  Actions                                                            */
  /* ------------------------------------------------------------------ */

  private applyAndExit(): void {
    setColliderConfig(this.config);
    saveColliderConfig();
    this.scene.start('Game');
  }

  private resetConfig(): void {
    resetColliderConfig();
    this.config = getColliderConfig();
    this.valueEls.forEach((_el, key) => {
      const decimals = key === 'scale' ? 1 : 0;
      this.updateValueDisplay(key as keyof ColliderConfig, decimals);
    });
    this.updateTypeToggle();
    this.updateControlVisibility();
    this.redrawOverlay();
  }

  private cancel(): void {
    this.scene.start('Game');
  }
}
