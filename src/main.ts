import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { LevelBuilderScene } from './scenes/LevelBuilderScene';
import { SpriteEditorScene } from './scenes/SpriteEditorScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: document.body,
  width: 960,
  height: 540,
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 800 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, GameScene, LevelBuilderScene, SpriteEditorScene],
  backgroundColor: '#1a1a2e',
};

new Phaser.Game(config);
