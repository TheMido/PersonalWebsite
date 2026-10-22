import { runtime } from '../config';

export class TiltController {
  targetX = 0;
  targetY = 0;
  valueX = 0;
  valueY = 0;

  private velocityX = 0;
  private velocityY = 0;
  private disposed = false;
  private orientationBound = false;
  private usingOrientation = false;

  constructor() {
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onTouch = this.onTouch.bind(this);
    this.onDeviceOrientation = this.onDeviceOrientation.bind(this);
  }

  attach(): void {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
    window.addEventListener('touchmove', this.onTouch, { passive: true });
    window.addEventListener('touchstart', this.onTouch, { passive: true });
    window.addEventListener('deviceorientation', this.onDeviceOrientation, { passive: true });
    this.orientationBound = true;
  }

  // iOS 13+ permission request
  async requestOrientationPermission(): Promise<void> {
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (!DOE?.requestPermission) return;
    try {
      const result = await DOE.requestPermission();
      this.usingOrientation = result === 'granted';
    } catch {
      this.usingOrientation = false;
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.usingOrientation) return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.targetX = (event.clientX / w) * 2 - 1;
    this.targetY = (event.clientY / h) * 2 - 1;
  }

  private onPointerLeave(): void {
    if (this.usingOrientation) return;
    this.targetX = 0;
    this.targetY = 0;
  }

  private onTouch(event: TouchEvent): void {
    if (this.usingOrientation) return;
    const touch = event.touches[0];
    if (!touch) return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.targetX = (touch.clientX / w) * 2 - 1;
    this.targetY = (touch.clientY / h) * 2 - 1;
  }

  private onDeviceOrientation(event: DeviceOrientationEvent): void {
    if (event.gamma == null || event.beta == null) return;
    // gamma: left/right tilt (-90..90), beta: front/back (-180..180)
    const gx = Math.max(-1, Math.min(1, event.gamma / 35));
    const gy = Math.max(-1, Math.min(1, (event.beta - 45) / 45));
    this.targetX = gx;
    this.targetY = gy;
  }

  /** Advance the damped spring. `dt` in seconds. */
  update(dt: number): void {
    const step = Math.min(dt, 1 / 30);
    const stiffness = runtime.tiltDamping * runtime.tiltDamping;
    const damping = 2 * runtime.tiltDamping;

    for (const axis of ['X', 'Y'] as const) {
      const target = this[`target${axis}`] as number;
      const value = this[`value${axis}`] as number;
      const velocity = this[`velocity${axis}`] as number;

      const acceleration = (target - value) * stiffness - velocity * damping;
      const nextVelocity = velocity + acceleration * step;
      const nextValue = value + nextVelocity * step;

      this[`velocity${axis}`] = nextVelocity;
      this[`value${axis}`] = nextValue;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('touchmove', this.onTouch);
    window.removeEventListener('touchstart', this.onTouch);
    if (this.orientationBound) {
      window.removeEventListener('deviceorientation', this.onDeviceOrientation);
    }
  }
}

export function isMobileLike(): boolean {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse || window.innerWidth <= runtime.mobileBreakpoint;
}
