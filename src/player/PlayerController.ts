import Phaser from 'phaser';

/** Serialized field descriptor for the dev panel */
export interface SerializedField {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  category: string;
}

/** All tuneable movement parameters */
export interface MovementConfig {
  // Horizontal
  moveSpeed: number;
  runMultiplier: number;
  acceleration: number;
  deceleration: number;
  airAcceleration: number;
  airDeceleration: number;

  // Jumping
  jumpForce: number;
  jumpCutMultiplier: number;
  coyoteTime: number;
  jumpBufferTime: number;
  maxFallSpeed: number;
  fallMultiplier: number;

  // Wall
  wallSlideSpeed: number;
  wallJumpForce: number;
  wallJumpHorizontalForce: number;
  wallJumpLockTime: number;

  // Dash
  dashSpeed: number;
  dashDuration: number;
  dashCooldown: number;

  // Physics scale
  gravityScale: number;

  // Spawn
  spawnX: number;
  spawnY: number;
}

const DEFAULT_CONFIG: MovementConfig = {
  moveSpeed: 160,
  runMultiplier: 1.6,
  acceleration: 1200,
  deceleration: 1600,
  airAcceleration: 800,
  airDeceleration: 400,

  jumpForce: 340,
  jumpCutMultiplier: 0.4,
  coyoteTime: 80,
  jumpBufferTime: 100,
  maxFallSpeed: 450,
  fallMultiplier: 1.5,

  wallSlideSpeed: 60,
  wallJumpForce: 300,
  wallJumpHorizontalForce: 200,
  wallJumpLockTime: 200,

  dashSpeed: 400,
  dashDuration: 150,
  dashCooldown: 600,

  gravityScale: 1.0,

  spawnX: 160,
  spawnY: 0, // overridden at construction
};

export class PlayerController {
  sprite: Phaser.Physics.Arcade.Sprite;
  config: MovementConfig;
  scene: Phaser.Scene;

  // Input state
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyRun!: Phaser.Input.Keyboard.Key;
  private keyDash!: Phaser.Input.Keyboard.Key;
  private keyJump!: Phaser.Input.Keyboard.Key;

  // Movement state
  private facingRight = true;
  private isGrounded = false;
  private wasGrounded = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private isJumping = false;
  private isDashing = false;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private isTouchingWall = false;
  private wallDirection = 0; // -1 left, 1 right
  private wallJumpLockTimer = 0;
  private currentAnim = '';

  // Mobile touch input
  private touchMoveX = 0;
  private touchJump = false;
  private touchDash = false;
  private isMobile = false;

  // Touch control elements
  private joystickBase?: Phaser.GameObjects.Arc;
  private joystickThumb?: Phaser.GameObjects.Arc;
  private jumpButton?: Phaser.GameObjects.Arc;
  private jumpButtonLabel?: Phaser.GameObjects.Text;
  private dashButton?: Phaser.GameObjects.Arc;
  private dashButtonLabel?: Phaser.GameObjects.Text;
  private joystickPointer: Phaser.Input.Pointer | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, config?: Partial<MovementConfig>) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, spawnX: x, spawnY: y, ...config };

    this.sprite = scene.physics.add.sprite(x, y, 'samurai-idle');
    this.sprite.setScale(2);
    this.sprite.setSize(24, 40);
    this.sprite.setOffset(36, 50);
    this.sprite.setCollideWorldBounds(false);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocityY(this.config.maxFallSpeed);

    // Keyboard input
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.keyRun = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this.keyDash = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      this.keyJump = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    // Detect mobile
    this.isMobile = !scene.sys.game.device.os.desktop;
    if (this.isMobile) {
      this.createTouchControls();
    }

    this.sprite.play('player-idle');
  }

  private createTouchControls(): void {
    const cam = this.scene.cameras.main;
    const uiScene = this.scene;

    // Joystick (left side)
    const jx = 90;
    const jy = cam.height - 90;
    this.joystickBase = uiScene.add.circle(jx, jy, 50, 0x000000, 0.3).setScrollFactor(0).setDepth(1000);
    this.joystickThumb = uiScene.add.circle(jx, jy, 24, 0xffffff, 0.5).setScrollFactor(0).setDepth(1001);

    // Jump button (right side)
    const bx = cam.width - 90;
    const by = cam.height - 90;
    this.jumpButton = uiScene.add.circle(bx, by, 35, 0xe85d04, 0.4).setScrollFactor(0).setDepth(1000).setInteractive();
    this.jumpButtonLabel = uiScene.add.text(bx, by, 'A', { fontSize: '20px', color: '#fff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    // Dash button
    this.dashButton = uiScene.add.circle(bx - 90, by, 30, 0x3a86ff, 0.4).setScrollFactor(0).setDepth(1000).setInteractive();
    this.dashButtonLabel = uiScene.add.text(bx - 90, by, 'B', { fontSize: '18px', color: '#fff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    // Jump button events
    this.jumpButton.on('pointerdown', () => { this.touchJump = true; });
    this.jumpButton.on('pointerup', () => { this.touchJump = false; });
    this.jumpButton.on('pointerout', () => { this.touchJump = false; });

    // Dash button events
    this.dashButton.on('pointerdown', () => { this.touchDash = true; });
    this.dashButton.on('pointerup', () => { this.touchDash = false; });
    this.dashButton.on('pointerout', () => { this.touchDash = false; });

    // Joystick touch handling
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.x < cam.width / 2) {
        this.joystickPointer = pointer;
      }
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer === this.joystickPointer) {
        const dx = pointer.x - jx;
        const maxDist = 40;
        this.touchMoveX = Phaser.Math.Clamp(dx / maxDist, -1, 1);
        const clampedX = jx + this.touchMoveX * maxDist;
        this.joystickThumb?.setPosition(clampedX, jy);
      }
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer === this.joystickPointer) {
        this.joystickPointer = null;
        this.touchMoveX = 0;
        this.joystickThumb?.setPosition(jx, jy);
      }
    });
  }

  /** Returns all serialized fields for the dev panel */
  getSerializedFields(): SerializedField[] {
    return [
      { key: 'moveSpeed', label: 'Move Speed', value: this.config.moveSpeed, min: 50, max: 500, step: 10, category: 'Horizontal' },
      { key: 'runMultiplier', label: 'Run Multiplier', value: this.config.runMultiplier, min: 1, max: 3, step: 0.1, category: 'Horizontal' },
      { key: 'acceleration', label: 'Acceleration', value: this.config.acceleration, min: 100, max: 3000, step: 50, category: 'Horizontal' },
      { key: 'deceleration', label: 'Deceleration', value: this.config.deceleration, min: 100, max: 3000, step: 50, category: 'Horizontal' },
      { key: 'airAcceleration', label: 'Air Accel', value: this.config.airAcceleration, min: 100, max: 2000, step: 50, category: 'Horizontal' },
      { key: 'airDeceleration', label: 'Air Decel', value: this.config.airDeceleration, min: 100, max: 2000, step: 50, category: 'Horizontal' },

      { key: 'jumpForce', label: 'Jump Force', value: this.config.jumpForce, min: 100, max: 800, step: 10, category: 'Jump' },
      { key: 'jumpCutMultiplier', label: 'Jump Cut Mult', value: this.config.jumpCutMultiplier, min: 0.1, max: 1, step: 0.05, category: 'Jump' },
      { key: 'coyoteTime', label: 'Coyote Time (ms)', value: this.config.coyoteTime, min: 0, max: 300, step: 10, category: 'Jump' },
      { key: 'jumpBufferTime', label: 'Jump Buffer (ms)', value: this.config.jumpBufferTime, min: 0, max: 300, step: 10, category: 'Jump' },
      { key: 'maxFallSpeed', label: 'Max Fall Speed', value: this.config.maxFallSpeed, min: 100, max: 1000, step: 10, category: 'Jump' },
      { key: 'fallMultiplier', label: 'Fall Multiplier', value: this.config.fallMultiplier, min: 1, max: 4, step: 0.1, category: 'Jump' },

      { key: 'wallSlideSpeed', label: 'Wall Slide Speed', value: this.config.wallSlideSpeed, min: 10, max: 200, step: 5, category: 'Wall' },
      { key: 'wallJumpForce', label: 'Wall Jump Force', value: this.config.wallJumpForce, min: 100, max: 600, step: 10, category: 'Wall' },
      { key: 'wallJumpHorizontalForce', label: 'Wall Jump H-Force', value: this.config.wallJumpHorizontalForce, min: 50, max: 500, step: 10, category: 'Wall' },
      { key: 'wallJumpLockTime', label: 'Wall Jump Lock (ms)', value: this.config.wallJumpLockTime, min: 50, max: 500, step: 10, category: 'Wall' },

      { key: 'dashSpeed', label: 'Dash Speed', value: this.config.dashSpeed, min: 100, max: 800, step: 10, category: 'Dash' },
      { key: 'dashDuration', label: 'Dash Duration (ms)', value: this.config.dashDuration, min: 50, max: 500, step: 10, category: 'Dash' },
      { key: 'dashCooldown', label: 'Dash Cooldown (ms)', value: this.config.dashCooldown, min: 100, max: 2000, step: 50, category: 'Dash' },

      { key: 'gravityScale', label: 'Gravity Scale', value: this.config.gravityScale, min: 0.1, max: 3, step: 0.1, category: 'Physics' },

      { key: 'spawnX', label: 'Spawn X', value: this.config.spawnX, min: 0, max: 3200, step: 32, category: 'Spawn' },
      { key: 'spawnY', label: 'Spawn Y', value: this.config.spawnY, min: 0, max: 960, step: 32, category: 'Spawn' },
    ];
  }

  /** Update a config value from the dev panel */
  setConfigValue(key: string, value: number): void {
    if (key in this.config) {
      (this.config as unknown as Record<string, number>)[key] = value;
      // Apply immediate updates
      if (key === 'maxFallSpeed') {
        (this.sprite.body as Phaser.Physics.Arcade.Body).setMaxVelocityY(value);
      }
    }
  }

  update(dt: number): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const delta = dt; // ms

    // Apply gravity scale
    body.setGravityY(
      (this.config.gravityScale - 1) * this.scene.physics.world.gravity.y
    );

    // Ground check
    this.wasGrounded = this.isGrounded;
    this.isGrounded = body.blocked.down || body.touching.down;

    // Wall check
    this.isTouchingWall = body.blocked.left || body.blocked.right;
    if (body.blocked.left) this.wallDirection = -1;
    else if (body.blocked.right) this.wallDirection = 1;

    // Timers
    if (this.isGrounded) {
      this.coyoteTimer = this.config.coyoteTime;
      this.isJumping = false;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - delta);
    }
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - delta);
    this.wallJumpLockTimer = Math.max(0, this.wallJumpLockTimer - delta);
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - delta);

    // Dashing
    if (this.isDashing) {
      this.dashTimer -= delta;
      if (this.dashTimer <= 0) {
        this.isDashing = false;
        body.setAllowGravity(true);
      } else {
        // During dash, maintain velocity and skip other movement
        this.updateAnimation();
        return;
      }
    }

    // Read input
    const inputX = this.getInputX();
    const wantJump = this.getJumpPressed();
    const wantJumpHeld = this.getJumpHeld();
    const wantDash = this.getDashPressed();
    const isRunning = this.keyRun?.isDown ?? false;

    // Jump buffer
    if (wantJump) {
      this.jumpBufferTimer = this.config.jumpBufferTime;
    }

    // -- Horizontal movement --
    if (this.wallJumpLockTimer <= 0) {
      const targetSpeed = inputX * this.config.moveSpeed * (isRunning ? this.config.runMultiplier : 1);
      const accel = this.isGrounded
        ? (inputX !== 0 ? this.config.acceleration : this.config.deceleration)
        : (inputX !== 0 ? this.config.airAcceleration : this.config.airDeceleration);

      const diff = targetSpeed - body.velocity.x;
      const change = accel * (delta / 1000);

      if (Math.abs(diff) <= change) {
        body.setVelocityX(targetSpeed);
      } else {
        body.setVelocityX(body.velocity.x + Math.sign(diff) * change);
      }
    }

    // Facing
    if (inputX > 0) this.facingRight = true;
    else if (inputX < 0) this.facingRight = false;
    this.sprite.setFlipX(!this.facingRight);

    // -- Jump --
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && !this.isJumping) {
      body.setVelocityY(-this.config.jumpForce);
      this.isJumping = true;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
    }

    // Wall jump
    if (wantJump && !this.isGrounded && this.isTouchingWall) {
      body.setVelocityY(-this.config.wallJumpForce);
      body.setVelocityX(-this.wallDirection * this.config.wallJumpHorizontalForce);
      this.facingRight = this.wallDirection < 0;
      this.wallJumpLockTimer = this.config.wallJumpLockTime;
      this.isJumping = true;
      this.jumpBufferTimer = 0;
    }

    // Jump cut (variable jump height)
    if (this.isJumping && !wantJumpHeld && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * this.config.jumpCutMultiplier);
      this.isJumping = false;
    }

    // Better fall feel
    if (body.velocity.y > 0) {
      body.setGravityY(
        (this.config.gravityScale * this.config.fallMultiplier - 1) * this.scene.physics.world.gravity.y
      );
    }

    // Wall slide
    if (!this.isGrounded && this.isTouchingWall && body.velocity.y > 0 && inputX !== 0) {
      body.setVelocityY(Math.min(body.velocity.y, this.config.wallSlideSpeed));
    }

    // -- Dash --
    if (wantDash && this.dashCooldownTimer <= 0 && !this.isDashing) {
      this.isDashing = true;
      this.dashTimer = this.config.dashDuration;
      this.dashCooldownTimer = this.config.dashCooldown;
      const dir = this.facingRight ? 1 : -1;
      body.setVelocity(dir * this.config.dashSpeed, 0);
      body.setAllowGravity(false);
    }

    this.updateAnimation();
  }

  private updateAnimation(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    let anim = 'player-idle';

    if (this.isDashing) {
      anim = 'player-dash';
    } else if (!this.isGrounded && this.isTouchingWall && body.velocity.y > 0 && this.getInputX() !== 0) {
      anim = 'player-wall-slide';
    } else if (!this.isGrounded) {
      anim = body.velocity.y < 0 ? 'player-jump' : 'player-fall';
    } else if (Math.abs(body.velocity.x) > 20) {
      anim = Math.abs(body.velocity.x) > this.config.moveSpeed * 1.2 ? 'player-run' : 'player-run';
    }

    if (this.currentAnim !== anim) {
      this.currentAnim = anim;
      this.sprite.play(anim, true);
    }
  }

  // -- Input helpers (unified keyboard + touch) --

  private getInputX(): number {
    if (this.isMobile && this.touchMoveX !== 0) return this.touchMoveX;
    if (this.cursors?.left.isDown) return -1;
    if (this.cursors?.right.isDown) return 1;
    return 0;
  }

  private getJumpPressed(): boolean {
    if (this.touchJump) {
      this.touchJump = false; // consume
      return true;
    }
    return Phaser.Input.Keyboard.JustDown(this.keyJump) ||
           Phaser.Input.Keyboard.JustDown(this.cursors?.up);
  }

  private getJumpHeld(): boolean {
    return this.keyJump?.isDown || this.cursors?.up.isDown || false;
  }

  private getDashPressed(): boolean {
    if (this.touchDash) {
      this.touchDash = false;
      return true;
    }
    return Phaser.Input.Keyboard.JustDown(this.keyDash);
  }
}
