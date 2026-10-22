import siteData from './site.json';

export interface SiteData {
  name: string;
  nickname?: string;
  tagline: string;
  shortLine: string;
  location: string;
  available: boolean;
  url: string;
  links: {
    telegram: string;
    linkedin: string;
    github: string;
  };
}

export const site: SiteData = siteData;

export const palette = {
  bg: '#05060a',
  bgDeep: '#020306',
  ink: '#f2f4f8',
  inkMuted: '#8b93a7',
  cyan: '#00e5ff',
  violet: '#7c4dff',
} as const;

export const tokens: readonly string[] = [
  'yolo',
  'resnet',
  'vision_transformer',
  'object_detection',
  'segmentation',
  'feature_map',
  'optical_flow',
  'point_cloud',
  'depth_map',
  'backbone',
  'nerf',
  'iou_loss',
  'non_max_suppression',
  'conv2d',
  'batch_norm',
  'opencv',
  'pytorch',
  'cuda',
  'onnx',
  'latent_space',
  'attention',
  'tensor',
  'softmax',
  'loss.backward()',
  'transformer',
  'embedding',
  'autograd',
  'encoder',
  'decoder',
  'multi_head',
  'gradient',
  'backprop',
  'optimizer',
  'adamw',
  'inference',
  'fp16_precision',
  'zero_shot',
  'diffusion',
  'bbox_regression',
  'semantic_mask',
  'matrix',
  'weights',
  'bias',
  '[0.82, -0.14]',
  '[[0.9, 0.1], [-0.3, 0.7]]',
  '3.14159',
  '1e-5',
  'lr=3e-4',
  'batch=64',
  'd_model=768',
];

/** Runtime behaviour switches. */
export const runtime = {
  /** Maximum device pixel ratio (perf). */
  maxPixelRatio: 2,
  /** Below this width we thin out the scene for performance. */
  mobileBreakpoint: 720,
  /** Master tilt amplitude in degrees. */
  maxTiltDeg: 8,
  /** How quickly the tilt catches up with the pointer (higher = snappier). */
  tiltDamping: 3.2,
} as const;
