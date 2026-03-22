import Phaser from 'phaser';

/** Builds the sample Autumn Forest level */
export class LevelBuilder {
  scene: Phaser.Scene;
  platforms!: Phaser.Physics.Arcade.StaticGroup;
  walls!: Phaser.Physics.Arcade.StaticGroup;

  // Level dimensions
  readonly TILE = 32; // display tile size (16px art scaled 2x)
  readonly WORLD_WIDTH = 3200;
  readonly WORLD_HEIGHT = 960;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  build(): void {
    this.createParallaxBackground();
    this.createLevel();
    this.createDecorations();

    // Set world bounds
    this.scene.physics.world.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);
  }

  private createParallaxBackground(): void {
    const cam = this.scene.cameras.main;
    const bgScale = this.WORLD_HEIGHT / 180; // scale 320x180 backgrounds to fill height

    // Layer 1 - farthest (dark forest silhouettes)
    for (let i = 0; i < Math.ceil(this.WORLD_WIDTH / (320 * bgScale)) + 1; i++) {
      this.scene.add.image(i * 320 * bgScale, 0, 'bg-back')
        .setOrigin(0, 0)
        .setScale(bgScale)
        .setScrollFactor(0.1)
        .setDepth(-30);
    }

    // Layer 2 - mid (lighter forest)
    for (let i = 0; i < Math.ceil(this.WORLD_WIDTH / (320 * bgScale)) + 1; i++) {
      this.scene.add.image(i * 320 * bgScale, 0, 'bg-mid')
        .setOrigin(0, 0)
        .setScale(bgScale)
        .setScrollFactor(0.3)
        .setDepth(-20);
    }

    // Layer 3 - front (closest trees)
    for (let i = 0; i < Math.ceil(this.WORLD_WIDTH / (320 * bgScale)) + 1; i++) {
      this.scene.add.image(i * 320 * bgScale, 0, 'bg-front')
        .setOrigin(0, 0)
        .setScale(bgScale)
        .setScrollFactor(0.6)
        .setDepth(-10);
    }
  }

  private createLevel(): void {
    this.platforms = this.scene.physics.add.staticGroup();
    this.walls = this.scene.physics.add.staticGroup();

    const T = this.TILE;
    const groundY = this.WORLD_HEIGHT - T * 2;

    // === MAIN GROUND ===
    // Ground spans most of the level with some gaps
    this.addGroundSegment(0, groundY, 28); // 0 to 896
    this.addGroundSegment(31 * T, groundY, 20); // gap, then 992 to 1632
    this.addGroundSegment(54 * T, groundY, 30); // 1728 to 2688
    this.addGroundSegment(87 * T, groundY, 13); // 2784 to 3200

    // === PLATFORMS ===
    // Stepping platforms near the start
    this.addPlatform(8 * T, groundY - 4 * T, 4);
    this.addPlatform(14 * T, groundY - 7 * T, 3);
    this.addPlatform(20 * T, groundY - 5 * T, 5);

    // Platforms over the first gap
    this.addPlatform(28 * T, groundY - 3 * T, 3);
    this.addPlatform(30 * T, groundY - 6 * T, 2);

    // Mid-section elevated area
    this.addPlatform(38 * T, groundY - 4 * T, 6);
    this.addPlatform(42 * T, groundY - 8 * T, 4);
    this.addPlatform(36 * T, groundY - 11 * T, 3);

    // Higher platforms chain
    this.addPlatform(48 * T, groundY - 6 * T, 3);
    this.addPlatform(52 * T, groundY - 4 * T, 2);

    // Right section - tower of platforms
    this.addPlatform(62 * T, groundY - 4 * T, 5);
    this.addPlatform(65 * T, groundY - 8 * T, 4);
    this.addPlatform(60 * T, groundY - 12 * T, 3);
    this.addPlatform(68 * T, groundY - 12 * T, 3);

    // Far right
    this.addPlatform(78 * T, groundY - 5 * T, 4);
    this.addPlatform(84 * T, groundY - 3 * T, 3);

    // === WALLS (for wall jumping) ===
    this.addWall(26 * T, groundY - 8 * T, 8);  // left side of first gap
    this.addWall(31 * T, groundY - 8 * T, 8);  // right side of first gap
    this.addWall(56 * T, groundY - 10 * T, 10); // tall wall mid-right
    this.addWall(74 * T, groundY - 8 * T, 8);
    this.addWall(76 * T, groundY - 8 * T, 8);
  }

  /** Add a horizontal ground segment */
  private addGroundSegment(x: number, y: number, widthInTiles: number): void {
    const T = this.TILE;
    // Top surface
    const surface = this.scene.add.tileSprite(
      x + (widthInTiles * T) / 2,
      y + T / 2,
      widthInTiles * 16,
      16,
      'tileset',
      0
    );
    surface.setScale(2);
    surface.setDepth(1);

    // Fill below
    const fill = this.scene.add.tileSprite(
      x + (widthInTiles * T) / 2,
      y + T + T / 2,
      widthInTiles * 16,
      16,
      'tileset',
      0
    );
    fill.setScale(2);
    fill.setTint(0x3d2b1f);
    fill.setDepth(1);

    // Physics body
    const platform = this.platforms.create(
      x + (widthInTiles * T) / 2,
      y + T / 2,
      undefined
    ) as Phaser.Physics.Arcade.Sprite;
    platform.setVisible(false);
    const platformBody = platform.body as Phaser.Physics.Arcade.StaticBody;
    platformBody.setSize(widthInTiles * T, T * 2);
    platformBody.setOffset(-(widthInTiles * T) / 2, -T);
  }

  /** Add a floating platform */
  private addPlatform(x: number, y: number, widthInTiles: number): void {
    const T = this.TILE;

    const surface = this.scene.add.tileSprite(
      x + (widthInTiles * T) / 2,
      y + T / 2,
      widthInTiles * 16,
      16,
      'tileset',
      0
    );
    surface.setScale(2);
    surface.setDepth(1);

    const plat = this.platforms.create(
      x + (widthInTiles * T) / 2,
      y + T / 2,
      undefined
    ) as Phaser.Physics.Arcade.Sprite;
    plat.setVisible(false);
    const platBody = plat.body as Phaser.Physics.Arcade.StaticBody;
    platBody.setSize(widthInTiles * T, T);
    platBody.setOffset(-(widthInTiles * T) / 2, -T / 2);
  }

  /** Add a vertical wall */
  private addWall(x: number, y: number, heightInTiles: number): void {
    const T = this.TILE;

    const wall = this.scene.add.tileSprite(
      x + T / 2,
      y + (heightInTiles * T) / 2,
      16,
      heightInTiles * 16,
      'tileset',
      0
    );
    wall.setScale(2);
    wall.setTint(0x5a3d2b);
    wall.setDepth(1);

    const wallBody = this.walls.create(
      x + T / 2,
      y + (heightInTiles * T) / 2,
      undefined
    ) as Phaser.Physics.Arcade.Sprite;
    wallBody.setVisible(false);
    const wb = wallBody.body as Phaser.Physics.Arcade.StaticBody;
    wb.setSize(T, heightInTiles * T);
    wb.setOffset(-T / 2, -(heightInTiles * T) / 2);
  }

  private createDecorations(): void {
    const groundY = this.WORLD_HEIGHT - this.TILE * 2;

    // Trees at various positions
    const treePositions = [100, 500, 1100, 1500, 2000, 2400, 2900];
    for (const tx of treePositions) {
      // Pick a random tree from the 3 in the sheet (400x160, ~133px each)
      const treeIndex = Math.floor(Math.random() * 3);
      const tree = this.scene.add.sprite(tx, groundY - 8, 'trees');
      tree.setScale(2.5);
      tree.setOrigin(0.15 + treeIndex * 0.35, 1);
      tree.setCrop(treeIndex * 133, 0, 133, 160);
      tree.setDepth(0);
      tree.setAlpha(0.9);
    }

    // Props (bushes, rocks, etc) scattered along ground - 256x32, individual small props
    const propPositions = [200, 350, 700, 950, 1300, 1800, 2200, 2600];
    for (const px of propPositions) {
      const prop = this.scene.add.image(px, groundY, 'props');
      prop.setScale(2);
      prop.setOrigin(0.5, 1);
      prop.setDepth(0);
    }

    // Objects (torii gate, lantern, well)
    const objPositions = [400, 1400, 2300];
    for (let i = 0; i < objPositions.length; i++) {
      const obj = this.scene.add.image(objPositions[i], groundY, 'objects');
      obj.setScale(2);
      obj.setOrigin(0.5, 1);
      obj.setDepth(0);
    }

    // Flags
    const flagPositions = [600, 1200, 2100, 2800];
    for (const fx of flagPositions) {
      const flag = this.scene.add.sprite(fx, groundY - 40, 'flag');
      flag.setScale(2);
      flag.setOrigin(0.5, 1);
      flag.setDepth(0);
      flag.play('flag-wave');
    }
  }
}
