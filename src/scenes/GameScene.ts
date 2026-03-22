import Phaser from 'phaser';
import { PlayerController } from '../player/PlayerController';
import { DevPanel } from '../debug/DevPanel';
import { getBuilderAssetById } from '../level/builderAssets';
import { LevelBuilder } from '../level/LevelBuilder';
import { getLevelTiles } from '../level/levelState';

export class GameScene extends Phaser.Scene {
  private player!: PlayerController;
  private devPanel!: DevPanel;
  private level!: LevelBuilder;
  private devMode = true;

  constructor() {
    super({ key: 'Game' });
  }

  create(): void {
    // Build level
    this.level = new LevelBuilder(this);
    this.level.build();
    this.buildPlacedTiles();

    // Spawn player
    const spawnX = 160;
    const spawnY = 160;
    this.player = new PlayerController(this, spawnX, spawnY);

    // Collisions
    this.physics.add.collider(this.player.sprite, this.level.platforms);
    this.physics.add.collider(this.player.sprite, this.level.walls);

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.level.WORLD_WIDTH, this.level.WORLD_HEIGHT);
    cam.startFollow(this.player.sprite, true, 0.08, 0.08);
    cam.setDeadzone(80, 60);
    cam.setZoom(1);

    // Dev panel
    if (this.devMode) {
      this.devPanel = new DevPanel(this.player, () => {
        this.scene.start('LevelBuilder');
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.devPanel.destroy();
      });

      // Toggle physics debug with F2
      this.input.keyboard?.addKey('F2').on('down', () => {
        this.physics.world.drawDebug = !this.physics.world.drawDebug;
        if (!this.physics.world.drawDebug) {
          this.physics.world.debugGraphic?.clear();
        }
      });
    }

    // Respawn if fallen
    this.input.keyboard?.addKey('R').on('down', () => {
      this.player.sprite.setPosition(this.player.config.spawnX, this.player.config.spawnY);
      (this.player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    });

    this.input.keyboard?.addKey('F3').on('down', () => {
      this.scene.start('LevelBuilder');
    });
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);

    // Respawn on fall
    if (this.player.sprite.y > this.level.WORLD_HEIGHT + 100) {
      this.player.sprite.setPosition(this.player.config.spawnX, this.player.config.spawnY);
      (this.player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    if (this.devMode) {
      this.devPanel.update();
    }
  }

  private buildPlacedTiles(): void {
    getLevelTiles().forEach((tile) => {
      const asset = getBuilderAssetById(tile.assetId);
      this.add.image(tile.x, tile.y, asset.texture, asset.frame)
        .setScale(asset.scale)
        .setDepth(10);

      const physicsSprite = this.level.platforms.create(tile.x, tile.y, undefined) as Phaser.Physics.Arcade.Sprite;
      physicsSprite.setVisible(false);
      const body = physicsSprite.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(tile.colliderWidth, tile.colliderHeight);
      body.setOffset(-tile.colliderWidth / 2, -tile.colliderHeight / 2);
    });
  }
}
