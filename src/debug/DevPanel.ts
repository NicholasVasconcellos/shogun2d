import { PlayerController, SerializedField } from '../player/PlayerController';

export class DevPanel {
  private container: HTMLDivElement;
  private player: PlayerController;
  private openLevelBuilder: () => void;
  private fields: SerializedField[] = [];
  private visible = true;
  private fpsText: HTMLSpanElement;
  private posText: HTMLSpanElement;
  private velText: HTMLSpanElement;
  private stateText: HTMLSpanElement;
  private viewCollidersInput?: HTMLInputElement;
  private inputMap: Map<string, HTMLInputElement> = new Map();
  private valueMap: Map<string, HTMLSpanElement> = new Map();

  constructor(
    player: PlayerController,
    openLevelBuilder: () => void,
    options?: {
      viewColliders?: boolean;
      onViewCollidersChange?: (enabled: boolean) => void;
    }
  ) {
    this.player = player;
    this.openLevelBuilder = openLevelBuilder;
    this.fields = player.getSerializedFields();

    // Build DOM
    this.container = document.createElement('div');
    this.container.id = 'dev-panel';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '320px',
      maxHeight: '100vh',
      overflowY: 'auto',
      background: 'rgba(10,10,30,0.92)',
      color: '#e0e0e0',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: '11px',
      padding: '8px',
      zIndex: '9999',
      borderLeft: '2px solid #e85d04',
      userSelect: 'none',
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
      borderBottom: '1px solid #333',
      paddingBottom: '6px',
    });

    const title = document.createElement('span');
    title.textContent = 'DEV PANEL';
    title.style.color = '#e85d04';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '13px';

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '[ - ]';
    Object.assign(toggleBtn.style, {
      background: 'none',
      border: '1px solid #555',
      color: '#aaa',
      cursor: 'pointer',
      fontSize: '11px',
      padding: '2px 6px',
    });

    const docsLink = document.createElement('a');
    docsLink.textContent = '[ DOCS ]';
    docsLink.href = '/docs.html';
    docsLink.target = '_blank';
    Object.assign(docsLink.style, {
      color: '#7fdbca',
      textDecoration: 'none',
      fontSize: '11px',
      border: '1px solid #555',
      padding: '2px 6px',
      cursor: 'pointer',
    });

    const levelBuilderBtn = document.createElement('button');
    levelBuilderBtn.textContent = '[ LEVEL BUILDER ]';
    Object.assign(levelBuilderBtn.style, {
      background: 'none',
      border: '1px solid #555',
      color: '#7fdbca',
      cursor: 'pointer',
      fontSize: '11px',
      padding: '2px 6px',
    });
    levelBuilderBtn.addEventListener('click', () => {
      this.openLevelBuilder();
    });

    header.appendChild(title);
    const headerBtns = document.createElement('div');
    Object.assign(headerBtns.style, { display: 'flex', gap: '4px' });
    headerBtns.appendChild(docsLink);
    headerBtns.appendChild(levelBuilderBtn);
    headerBtns.appendChild(toggleBtn);
    header.appendChild(headerBtns);
    this.container.appendChild(header);

    // Runtime info
    const infoBlock = this.createSection('Runtime');
    this.fpsText = this.createInfoLine(infoBlock, 'FPS');
    this.posText = this.createInfoLine(infoBlock, 'Position');
    this.velText = this.createInfoLine(infoBlock, 'Velocity');
    this.stateText = this.createInfoLine(infoBlock, 'State');
    this.viewCollidersInput = this.createToggleRow(
      infoBlock,
      'View Colliders',
      options?.viewColliders ?? false,
      (enabled) => options?.onViewCollidersChange?.(enabled)
    );

    // Serialized field sections
    const categories = [...new Set(this.fields.map(f => f.category))];
    for (const cat of categories) {
      const section = this.createSection(cat);
      const catFields = this.fields.filter(f => f.category === cat);
      for (const field of catFields) {
        this.createFieldRow(section, field);
      }
    }

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset All to Defaults';
    Object.assign(resetBtn.style, {
      width: '100%',
      padding: '6px',
      marginTop: '8px',
      background: '#2a1a1a',
      border: '1px solid #e85d04',
      color: '#e85d04',
      cursor: 'pointer',
      fontSize: '11px',
    });
    resetBtn.addEventListener('click', () => this.resetDefaults());
    this.container.appendChild(resetBtn);

    document.body.appendChild(this.container);

    // Toggle with backtick key
    let contentWrapper: HTMLDivElement | null = null;
    toggleBtn.addEventListener('click', () => {
      if (!contentWrapper) {
        contentWrapper = document.createElement('div');
        while (this.container.children.length > 1) {
          contentWrapper.appendChild(this.container.children[1]);
        }
        this.container.appendChild(contentWrapper);
      }
      const isHidden = contentWrapper.style.display === 'none';
      contentWrapper.style.display = isHidden ? '' : 'none';
      toggleBtn.textContent = isHidden ? '[ - ]' : '[ + ]';
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === 'F1') {
        e.preventDefault();
        this.visible = !this.visible;
        this.container.style.display = this.visible ? '' : 'none';
      }
    });
  }

  private createSection(title: string): HTMLDivElement {
    const section = document.createElement('div');
    section.style.marginBottom = '6px';

    const label = document.createElement('div');
    label.textContent = title.toUpperCase();
    Object.assign(label.style, {
      color: '#e85d04',
      fontSize: '10px',
      fontWeight: 'bold',
      letterSpacing: '1px',
      marginTop: '6px',
      marginBottom: '4px',
      borderBottom: '1px solid #333',
      paddingBottom: '2px',
    });
    section.appendChild(label);
    this.container.appendChild(section);
    return section;
  }

  private createInfoLine(parent: HTMLDivElement, label: string): HTMLSpanElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '1px 0',
    });

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.color = '#888';

    const val = document.createElement('span');
    val.textContent = '--';
    val.style.color = '#7fdbca';

    row.appendChild(lbl);
    row.appendChild(val);
    parent.appendChild(row);
    return val;
  }

  private createFieldRow(parent: HTMLDivElement, field: SerializedField): void {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'grid',
      gridTemplateColumns: '1fr 60px 40px',
      gap: '4px',
      alignItems: 'center',
      padding: '2px 0',
    });

    const label = document.createElement('span');
    label.textContent = field.label;
    label.style.color = '#bbb';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.whiteSpace = 'nowrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(field.min);
    slider.max = String(field.max);
    slider.step = String(field.step);
    slider.value = String(field.value);
    Object.assign(slider.style, {
      width: '100%',
      accentColor: '#e85d04',
      cursor: 'pointer',
      height: '14px',
    });

    const valDisplay = document.createElement('span');
    valDisplay.textContent = this.formatValue(field.value, field.step);
    valDisplay.style.color = '#7fdbca';
    valDisplay.style.textAlign = 'right';
    valDisplay.style.fontSize = '11px';

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      this.player.setConfigValue(field.key, v);
      valDisplay.textContent = this.formatValue(v, field.step);
    });

    this.inputMap.set(field.key, slider);
    this.valueMap.set(field.key, valDisplay);

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valDisplay);
    parent.appendChild(row);
  }

  private createToggleRow(
    parent: HTMLDivElement,
    labelText: string,
    initialValue: boolean,
    onChange: (value: boolean) => void
  ): HTMLInputElement {
    const row = document.createElement('label');
    Object.assign(row.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '3px 0',
      cursor: 'pointer',
    });

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.color = '#888';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = initialValue;
    Object.assign(input.style, {
      accentColor: '#19c37d',
      cursor: 'pointer',
    });
    input.addEventListener('change', () => onChange(input.checked));

    row.appendChild(label);
    row.appendChild(input);
    parent.appendChild(row);
    return input;
  }

  private formatValue(v: number, step: number): string {
    const decimals = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
    return v.toFixed(decimals);
  }

  resetDefaults(): void {
    const defaults = new PlayerController(this.player.scene, 0, 0);
    const defaultFields = defaults.getSerializedFields();
    defaults.sprite.destroy();

    for (const f of defaultFields) {
      this.player.setConfigValue(f.key, f.value);
      const slider = this.inputMap.get(f.key);
      const valDisplay = this.valueMap.get(f.key);
      if (slider) slider.value = String(f.value);
      if (valDisplay) valDisplay.textContent = this.formatValue(f.value, f.step);
    }
  }

  update(): void {
    if (!this.visible) return;

    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    const fps = Math.round(this.player.scene.game.loop.actualFps);

    this.fpsText.textContent = `${fps}`;
    this.fpsText.style.color = fps < 30 ? '#ff6b6b' : fps < 55 ? '#ffd93d' : '#7fdbca';
    this.posText.textContent = `${Math.round(this.player.sprite.x)}, ${Math.round(this.player.sprite.y)}`;
    this.velText.textContent = `${Math.round(body.velocity.x)}, ${Math.round(body.velocity.y)}`;

    const grounded = body.blocked.down || body.touching.down;
    const wall = body.blocked.left || body.blocked.right;
    const states: string[] = [];
    if (grounded) states.push('GND');
    if (wall) states.push('WALL');
    if (body.velocity.y < 0) states.push('JUMP');
    if (body.velocity.y > 10 && !grounded) states.push('FALL');
    this.stateText.textContent = states.join(' | ') || 'AIR';
  }

  destroy(): void {
    this.container.remove();
  }

  setViewCollidersEnabled(enabled: boolean): void {
    if (this.viewCollidersInput) {
      this.viewCollidersInput.checked = enabled;
    }
  }
}
