import Phaser from 'phaser';

/** Builds the default Autumn Forest level */
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
  }
}
