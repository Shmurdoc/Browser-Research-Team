// ============================================================
// Image Pipeline — Download, Process, Store, Extract Colors
// ============================================================
//
// Downloads design images from URLs, processes them with sharp,
// stores them locally as optimized WebP, and extracts dominant
// color palettes using k-means clustering on pixel data.
// ============================================================

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createLogger_Scoped } from '../logging/index.js';
import { getPatternStorageDir } from '../storage/local.js';

const logger = createLogger_Scoped('image-pipeline');

// Image storage configuration
const IMAGE_DIR_NAME = 'images';
const MAX_IMAGE_SIZE_PX = 1200; // max width/height for stored images
const IMAGE_QUALITY = 80; // WebP quality
const DOWNLOAD_TIMEOUT_MS = 15000;
const MAX_DOWNLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB max

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 100; // Initial backoff: 100ms, 200ms, 400ms, 800ms

// Color extraction configuration
const NUM_COLORS = 8; // number of dominant colors to extract
const COLOR_SAMPLE_SIZE = 150; // resize to this for color extraction

/** Result of image download and processing */
export interface ImageResult {
  /** Local file path relative to storage dir */
  localPath: string;
  /** SHA-256 hash of the original image */
  hash: string;
  /** Image dimensions */
  width: number;
  height: number;
  /** File size in bytes */
  fileSize: number;
  /** Dominant color palette (hex) */
  palette: string[];
  /** Whether the image is predominantly dark */
  isDark: boolean;
}

/**
 * Download an image from a URL, process it, and store locally.
 * Returns image metadata including hash, dimensions, and color palette.
 */
export async function downloadAndProcessImage(
  imageUrl: string,
  patternId: string
): Promise<ImageResult | null> {
  const start = Date.now();

  try {
    // Validate URL
    if (!isValidImageUrl(imageUrl)) {
      logger.warn({ url: imageUrl }, 'Invalid image URL');
      return null;
    }

    // Download the image
    const buffer = await downloadImage(imageUrl);
    if (!buffer || buffer.length === 0) {
      logger.warn({ url: imageUrl }, 'Downloaded empty image');
      return null;
    }

    // Compute hash of original
    const hash = computeHash(buffer);

    // Ensure storage directory exists
    const storageDir = getPatternStorageDir();
    const imageDir = join(storageDir, IMAGE_DIR_NAME);
    if (!existsSync(imageDir)) {
      mkdirSync(imageDir, { recursive: true });
    }

    // Process with sharp: resize, convert to WebP
    const processed = await sharp(buffer)
      .resize(MAX_IMAGE_SIZE_PX, MAX_IMAGE_SIZE_PX, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: IMAGE_QUALITY })
      .toBuffer();

    // Determine file path
    const fileName = `${patternId}-${hash.slice(0, 12)}.webp`;
    const localPath = join(IMAGE_DIR_NAME, fileName);
    const fullPath = join(storageDir, localPath);

    // Write to disk
    writeFileSync(fullPath, processed);

    // Get dimensions
    const metadata = await sharp(processed).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    // Extract color palette
    const palette = await extractColorPalette(buffer);

    // Determine if dark
    const isDark = isDarkImage(palette);

    const tookMs = Date.now() - start;
    logger.info(
      { patternId, hash: hash.slice(0, 8), width, height, palette: palette.slice(0, 3), tookMs },
      'Image downloaded and processed'
    );

    return {
      localPath,
      hash,
      width,
      height,
      fileSize: processed.length,
      palette,
      isDark,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ patternId, url: imageUrl, error: message }, 'Image processing failed');
    return null;
  }
}

/**
 * Extract dominant color palette from image buffer using pixel sampling.
 * Uses a simplified k-means approach on resized image pixels.
 */
export async function extractColorPalette(imageBuffer: Buffer): Promise<string[]> {
  try {
    // Resize to small size for fast color extraction
    const { data, info } = await sharp(imageBuffer)
      .resize(COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels: number[][] = [];
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * 3];
      const g = data[i * 3 + 1];
      const b = data[i * 3 + 2];
      // Skip near-white and near-black pixels (background noise)
      const brightness = (r + g + b) / 3;
      if (brightness > 245 || brightness < 15) continue;
      pixels.push([r, g, b]);
    }

    if (pixels.length < 10) {
      // Fallback: just return a few pixels
      return pixels.slice(0, NUM_COLORS).map(rgbToHex);
    }

    // K-means clustering
    const centroids = kMeans(pixels, NUM_COLORS, 10);
    return centroids.map(rgbToHex);
  } catch {
    // Fallback palette
    return ['#3B82F6', '#10B981', '#F59E0B', '#6B7280', '#FFFFFF', '#111827'];
  }
}

/**
 * Get the local file path for a stored image.
 * Returns null if the image doesn't exist.
 */
export function getImagePath(patternId: string, hash: string): string | null {
  const storageDir = getPatternStorageDir();
  const imageDir = join(storageDir, IMAGE_DIR_NAME);
  const fileName = `${patternId}-${hash.slice(0, 12)}.webp`;
  const fullPath = join(imageDir, fileName);

  if (existsSync(fullPath)) {
    return fullPath;
  }
  return null;
}

/**
 * Read a stored image as a buffer.
 */
export function readImageFile(patternId: string, hash: string): Buffer | null {
  const path = getImagePath(patternId, hash);
  if (!path) return null;

  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

/**
 * Convert image to base64 data URL for API consumption.
 */
export function imageToDataUrl(patternId: string, hash: string): string | null {
  const buffer = readImageFile(patternId, hash);
  if (!buffer) return null;

  const base64 = buffer.toString('base64');
  return `data:image/webp;base64,${base64}`;
}

/**
 * Clean up images for a deleted pattern.
 */
export function deletePatternImages(patternId: string): void {
  const storageDir = getPatternStorageDir();
  const imageDir = join(storageDir, IMAGE_DIR_NAME);

  if (!existsSync(imageDir)) return;

  const files = require('node:fs').readdirSync(imageDir);
  for (const file of files) {
    if (file.startsWith(`${patternId}-`)) {
      require('node:fs').unlinkSync(join(imageDir, file));
    }
  }
}

// ============================================================
// Internal helpers
// ============================================================

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // Block private/internal URLs
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.')) return false;
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          },
          redirect: 'follow',
        });

        if (!response.ok) {
          // Don't retry on 4xx errors (permanent failures)
          if (response.status >= 400 && response.status < 500) {
            logger.warn({ url, status: response.status }, 'Image download failed (client error, no retry)');
            return null;
          }
          // Retry on 5xx errors
          if (attempt < MAX_RETRY_ATTEMPTS) {
            const delay = RETRY_BACKOFF_MS * Math.pow(2, attempt);
            logger.debug({ url, status: response.status, attempt, nextDelayMs: delay }, 'Retrying image download');
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          logger.warn({ url, status: response.status, attempts: attempt + 1 }, 'Image download failed after retries');
          return null;
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_SIZE_BYTES) {
          logger.warn({ url, size: contentLength }, 'Image too large');
          return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (attempt > 0) {
          logger.debug({ url, attempt: attempt + 1 }, 'Image download succeeded after retry');
        }
        return buffer;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const isNetworkError = error instanceof Error && 
        (error.message.includes('ECONNREFUSED') || 
         error.message.includes('ETIMEDOUT') || 
         error.message.includes('ENOTFOUND') ||
         error.message.includes('socket hang up'));

      // Retry on timeout or network errors
      if ((isAbort || isNetworkError) && attempt < MAX_RETRY_ATTEMPTS) {
        const delay = RETRY_BACKOFF_MS * Math.pow(2, attempt);
        const errorType = isAbort ? 'timeout' : 'network';
        logger.debug({ url, errorType, attempt, nextDelayMs: delay }, 'Retrying image download after error');
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Final error
      if (isAbort) {
        logger.warn({ url, attempts: attempt + 1 }, 'Image download timed out after retries');
      } else {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn({ url, error: message, attempts: attempt + 1 }, 'Image download failed after retries');
      }
      return null;
    }
  }

  return null;
}

function computeHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function rgbToHex(rgb: number[]): string {
  const r = Math.round(Math.max(0, Math.min(255, rgb[0])));
  const g = Math.round(Math.max(0, Math.min(255, rgb[1])));
  const b = Math.round(Math.max(0, Math.min(255, rgb[2])));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): number[] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function colorDistance(a: number[], b: number[]): number {
  // Weighted Euclidean distance (perceptual)
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  const rMean = (a[0] + b[0]) / 2;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

function kMeans(pixels: number[][], k: number, maxIterations: number): number[][] {
  if (pixels.length <= k) return pixels;

  // Initialize centroids using k-means++ style
  const centroids: number[][] = [];
  centroids.push([...pixels[Math.floor(Math.random() * pixels.length)]]);

  for (let c = 1; c < k; c++) {
    // Compute distances to nearest centroid
    const distances = pixels.map(p => {
      const minDist = Math.min(...centroids.map(cent => colorDistance(p, cent)));
      return minDist * minDist;
    });

    // Weighted random selection
    const totalDist = distances.reduce((a, b) => a + b, 0);
    if (totalDist === 0) {
      centroids.push([...pixels[Math.floor(Math.random() * pixels.length)]]);
      continue;
    }

    let rand = Math.random() * totalDist;
    for (let i = 0; i < distances.length; i++) {
      rand -= distances[i];
      if (rand <= 0) {
        centroids.push([...pixels[i]]);
        break;
      }
    }
    if (centroids.length <= c) {
      centroids.push([...pixels[Math.floor(Math.random() * pixels.length)]]);
    }
  }

  // Iterate
  const assignments = new Array(pixels.length).fill(0);
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Assign pixels to nearest centroid
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      let minIdx = 0;
      for (let c = 0; c < centroids.length; c++) {
        const dist = colorDistance(pixels[i], centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = c;
        }
      }
      if (assignments[i] !== minIdx) {
        assignments[i] = minIdx;
        changed = true;
      }
    }

    if (!changed) break;

    // Update centroids
    const sums: number[][] = centroids.map(() => [0, 0, 0]);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c][0] = sums[c][0] / counts[c];
        centroids[c][1] = sums[c][1] / counts[c];
        centroids[c][2] = sums[c][2] / counts[c];
      }
    }
  }

  // Sort by dominance (cluster size)
  const counts = new Array(k).fill(0);
  for (const a of assignments) counts[a]++;
  const indexed = centroids.map((c, i) => ({ centroid: c, count: counts[i] }));
  indexed.sort((a, b) => b.count - a.count);

  return indexed.map(i => i.centroid);
}

function isDarkImage(palette: string[]): boolean {
  if (palette.length === 0) return false;
  // Check the most dominant color (first in palette)
  const dominant = hexToRgb(palette[0]);
  const brightness = (dominant[0] * 299 + dominant[1] * 587 + dominant[2] * 114) / 1000;
  return brightness < 128;
}
