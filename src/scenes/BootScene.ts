import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    // -- Progress bar --
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const bar = this.add.graphics();
    const box = this.add.graphics();
    box.fillStyle(0x222222, 0.8);
    box.fillRect(w / 4, h / 2 - 15, w / 2, 30);

    this.load.on('progress', (v: number) => {
      bar.clear();
      bar.fillStyle(0xe85d04, 1);
      bar.fillRect(w / 4 + 4, h / 2 - 11, (w / 2 - 8) * v, 22);
    });

    this.load.on('complete', () => {
      bar.destroy();
      box.destroy();
    });

    // -- Samurai sprite sheets (all 96x96 frames) --
    const samuraiSheets: Record<string, number> = {
      'idle': 10,
      'run': 16,
      'walk': 12,
      'jump': 3,
      'jump-start': 3,
      'jump-fall': 3,
      'jump-transition': 3,
      'dash': 8,
      'attack-1': 7,
      'attack-2': 7,
      'attack-3': 6,
      'air-attack': 6,
      'death': 9,
      'hurt': 4,
      'defend': 6,
      'wall-slide': 3,
      'wall-contact': 3,
      'wall-jump': 3,
      'climbing': 8,
      'healing': 15,
      'healing-no-effect': 15,
      'special-attack': 14,
      'throw': 7,
    };

    for (const [key, frameCount] of Object.entries(samuraiSheets)) {
      this.load.spritesheet(`samurai-${key}`, `assets/samurai/${key}.png`, {
        frameWidth: 96,
        frameHeight: 96,
      });
    }

    // -- Backgrounds (parallax layers) --
    this.load.image('bg-back', 'assets/forest/background/1.png');
    this.load.image('bg-mid', 'assets/forest/background/2.png');
    this.load.image('bg-front', 'assets/forest/background/3.png');

    // -- Tileset --
    this.load.image('tileset', 'assets/forest/tileset/Tileset.png');
    this.load.image('tileset-v2', 'assets/forest/tileset/Tileset_v2.png');
    this.load.spritesheet('tileset-grid', 'assets/forest/tileset/Tileset.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('tileset-v2-grid', 'assets/forest/tileset/Tileset_v2.png', {
      frameWidth: 16,
      frameHeight: 16,
    });

    // -- Props & decoration --
    this.load.image('trees', 'assets/forest/trees/Trees.png');
    this.load.image('objects', 'assets/forest/props/Objects.png');
    this.load.image('props', 'assets/forest/props/Props.png');
    this.load.spritesheet('props-strip', 'assets/forest/props/Props.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('flag', 'assets/forest/props/Flag.png', {
      frameWidth: 29,
      frameHeight: 64,
    });
  }

  create(): void {
    // -- Create samurai animations --
    const anims: { key: string; sheet: string; frames: number; rate: number; repeat: number }[] = [
      { key: 'player-idle', sheet: 'samurai-idle', frames: 10, rate: 10, repeat: -1 },
      { key: 'player-run', sheet: 'samurai-run', frames: 16, rate: 20, repeat: -1 },
      { key: 'player-walk', sheet: 'samurai-walk', frames: 12, rate: 12, repeat: -1 },
      { key: 'player-jump', sheet: 'samurai-jump', frames: 3, rate: 8, repeat: 0 },
      { key: 'player-jump-start', sheet: 'samurai-jump-start', frames: 3, rate: 10, repeat: 0 },
      { key: 'player-fall', sheet: 'samurai-jump-fall', frames: 3, rate: 8, repeat: -1 },
      { key: 'player-dash', sheet: 'samurai-dash', frames: 8, rate: 16, repeat: 0 },
      { key: 'player-wall-slide', sheet: 'samurai-wall-slide', frames: 3, rate: 8, repeat: -1 },
      { key: 'player-attack-1', sheet: 'samurai-attack-1', frames: 7, rate: 14, repeat: 0 },
      { key: 'player-hurt', sheet: 'samurai-hurt', frames: 4, rate: 10, repeat: 0 },
    ];

    for (const a of anims) {
      this.anims.create({
        key: a.key,
        frames: this.anims.generateFrameNumbers(a.sheet, { start: 0, end: a.frames - 1 }),
        frameRate: a.rate,
        repeat: a.repeat,
      });
    }

    // Flag animation
    this.anims.create({
      key: 'flag-wave',
      frames: this.anims.generateFrameNumbers('flag', { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });

    this.scene.start('Game');
  }
}
