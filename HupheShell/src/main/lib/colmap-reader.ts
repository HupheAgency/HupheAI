import { readFile } from 'fs/promises'
import { join } from 'path'

export interface ColmapCamera {
  id: number
  width: number
  height: number
  fx: number
  fy: number
  cx: number
  cy: number
}

export interface ColmapImage {
  id: number
  name: string
  qvec: [number, number, number, number] // qw, qx, qy, qz
  tvec: [number, number, number]
  cameraId: number
}

export interface ColmapPose {
  // Camera position in Three.js world (OpenGL convention, Y-up), already floor-adjusted
  position: [number, number, number]
  // Camera quaternion in Three.js convention [qx, qy, qz, qw]
  quaternion: [number, number, number, number]
  // Vertical field of view in degrees
  fovY: number
  // Image dimensions (for aspect ratio)
  width: number
  height: number
  // Scene center in Three.js world (from mean of 3D points), already floor-adjusted
  sceneCenter: [number, number, number]
  // Y offset applied to the splat group so the floor aligns with Three.js Y=0
  groupPositionY: number
}

function readUint32LE(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset)
}

function readUint64LE(buf: Buffer, offset: number): number {
  // JS can't handle full uint64, but for counts / IDs this is fine
  const lo = buf.readUInt32LE(offset)
  const hi = buf.readUInt32LE(offset + 4)
  return hi * 2 ** 32 + lo
}

function readFloat64LE(buf: Buffer, offset: number): number {
  return buf.readDoubleBE !== undefined ? buf.readDoubleLE(offset) : 0
}

function readInt64LE(buf: Buffer, offset: number): number {
  const lo = buf.readInt32LE(offset)
  const hi = buf.readInt32LE(offset + 4)
  return hi * 2 ** 32 + lo
}

function readNullTerminatedString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
  let end = offset
  while (end < buf.length && buf[end] !== 0) end++
  return { value: buf.toString('utf8', offset, end), nextOffset: end + 1 }
}

// Number of params per camera model
const MODEL_PARAMS: Record<number, number> = {
  0: 3, // SIMPLE_PINHOLE: f, cx, cy
  1: 4, // PINHOLE: fx, fy, cx, cy
  2: 4, // SIMPLE_RADIAL: f, cx, cy, k
  3: 5, // RADIAL: f, cx, cy, k1, k2
  4: 8, // OPENCV: fx, fy, cx, cy, k1, k2, p1, p2
  5: 12, // OPENCV_FISHEYE
  6: 8, // FULL_OPENCV
  7: 5, // FOV
  8: 3, // SIMPLE_RADIAL_FISHEYE
  9: 4, // RADIAL_FISHEYE
  10: 8, // THIN_PRISM_FISHEYE
}

async function parseCamerasBin(filePath: string): Promise<Map<number, ColmapCamera>> {
  const buf = await readFile(filePath)
  let offset = 0

  const numCameras = readUint64LE(buf, offset)
  offset += 8

  const cameras = new Map<number, ColmapCamera>()

  for (let i = 0; i < numCameras; i++) {
    const cameraId = readUint32LE(buf, offset); offset += 4
    const modelId = buf.readInt32LE(offset); offset += 4
    const width = readUint64LE(buf, offset); offset += 8
    const height = readUint64LE(buf, offset); offset += 8

    const numParams = MODEL_PARAMS[modelId] ?? 4
    const params: number[] = []
    for (let p = 0; p < numParams; p++) {
      params.push(readFloat64LE(buf, offset))
      offset += 8
    }

    let fx: number, fy: number, cx: number, cy: number
    if (modelId === 0 || modelId === 2 || modelId === 8) {
      // SIMPLE_PINHOLE / SIMPLE_RADIAL / SIMPLE_RADIAL_FISHEYE: f, cx, cy
      fx = params[0]; fy = params[0]; cx = params[1]; cy = params[2]
    } else {
      // PINHOLE and others: fx, fy, cx, cy
      fx = params[0]; fy = params[1]; cx = params[2]; cy = params[3]
    }

    cameras.set(cameraId, { id: cameraId, width, height, fx, fy, cx, cy })
  }

  return cameras
}

async function parseImagesBin(filePath: string): Promise<ColmapImage[]> {
  const buf = await readFile(filePath)
  let offset = 0

  const numImages = readUint64LE(buf, offset)
  offset += 8

  const images: ColmapImage[] = []

  for (let i = 0; i < numImages; i++) {
    const imageId = readUint32LE(buf, offset); offset += 4

    const qw = readFloat64LE(buf, offset); offset += 8
    const qx = readFloat64LE(buf, offset); offset += 8
    const qy = readFloat64LE(buf, offset); offset += 8
    const qz = readFloat64LE(buf, offset); offset += 8

    const tx = readFloat64LE(buf, offset); offset += 8
    const ty = readFloat64LE(buf, offset); offset += 8
    const tz = readFloat64LE(buf, offset); offset += 8

    const cameraId = readUint32LE(buf, offset); offset += 4

    const { value: name, nextOffset } = readNullTerminatedString(buf, offset)
    offset = nextOffset

    const numPoints2D = readUint64LE(buf, offset); offset += 8
    // Skip 2D points: each is float64 x, float64 y, int64 point3D_id = 24 bytes
    offset += numPoints2D * 24

    images.push({
      id: imageId,
      name,
      qvec: [qw, qx, qy, qz],
      tvec: [tx, ty, tz],
      cameraId,
    })
  }

  return images
}

async function parsePoints3DBin(filePath: string): Promise<[number, number, number][]> {
  const buf = await readFile(filePath)
  let offset = 0

  const numPoints = readUint64LE(buf, offset)
  offset += 8

  const positions: [number, number, number][] = []

  for (let i = 0; i < numPoints; i++) {
    // point3D_id: uint64
    offset += 8
    const x = readFloat64LE(buf, offset); offset += 8
    const y = readFloat64LE(buf, offset); offset += 8
    const z = readFloat64LE(buf, offset); offset += 8
    // r, g, b: uint8 each
    offset += 3
    // error: float64
    offset += 8
    // track_length: uint64
    const trackLength = readUint64LE(buf, offset); offset += 8
    // track: trackLength * (uint32 image_id + uint32 point2D_idx) = 8 bytes each
    offset += trackLength * 8

    positions.push([x, y, z])
  }

  return positions
}

/**
 * Convert COLMAP world-to-camera quaternion + tvec to Three.js camera world pose.
 *
 * COLMAP convention (OpenCV): X right, Y down, Z forward
 * Three.js convention (OpenGL): X right, Y up, Z toward viewer
 *
 * The Gaussian Splat group carries rotation={[Math.PI, 0, 0]} which maps
 * COLMAP world (Y-down, Z-fwd) to Three.js world (Y-up, Z-back) via T = diag(1,-1,-1).
 *
 * Camera position: pos_gl = T * (-R^T * tvec) = (px, -py, -pz)
 *
 * Camera orientation: q_gl = T * q_c2w * T^{-1}
 *   where q_c2w = conjugate(qvec) and T represents 180° around X.
 *   This similarity transform simplifies to: q_gl = (-qx, qy, qz, qw) in Three.js (x,y,z,w).
 */
function colmapPoseToThreeJs(qvec: [number, number, number, number], tvec: [number, number, number]): {
  position: [number, number, number]
  quaternion: [number, number, number, number] // [qx, qy, qz, qw]
} {
  const [qw, qx, qy, qz] = qvec
  const [tx, ty, tz] = tvec

  // Build rotation matrix R (world-to-camera) from quaternion
  const r00 = 1 - 2 * (qy * qy + qz * qz)
  const r01 = 2 * (qx * qy - qw * qz)
  const r02 = 2 * (qx * qz + qw * qy)
  const r10 = 2 * (qx * qy + qw * qz)
  const r11 = 1 - 2 * (qx * qx + qz * qz)
  const r12 = 2 * (qy * qz - qw * qx)
  const r20 = 2 * (qx * qz - qw * qy)
  const r21 = 2 * (qy * qz + qw * qx)
  const r22 = 1 - 2 * (qx * qx + qy * qy)

  // Camera world position in COLMAP space: pos = -R^T * t
  const px = -(r00 * tx + r10 * ty + r20 * tz)
  const py = -(r01 * tx + r11 * ty + r21 * tz)
  const pz = -(r02 * tx + r12 * ty + r22 * tz)

  // Flip Y and Z to convert from COLMAP (Y-down, Z-fwd) to Three.js (Y-up, Z-back)
  const position: [number, number, number] = [px, -py, -pz]

  // Quaternion: similarity transform T * q_c2w * T^{-1} where T = Rx(180°)
  // Reduces to: Three.js (x,y,z,w) = (-qx, qy, qz, qw)
  const quaternion: [number, number, number, number] = [-qx, qy, qz, qw]

  return { position, quaternion }
}

export async function readColmapPose(sparseDir: string): Promise<ColmapPose> {
  const camerasPath = join(sparseDir, 'cameras.bin')
  const imagesPath = join(sparseDir, 'images.bin')
  const points3DPath = join(sparseDir, 'points3D.bin')

  const [cameras, images] = await Promise.all([
    parseCamerasBin(camerasPath),
    parseImagesBin(imagesPath),
  ])

  if (images.length === 0) throw new Error('Geen frames gevonden in COLMAP images.bin')

  // Sort images by name and pick the first (frame_0000 or similar)
  images.sort((a, b) => a.name.localeCompare(b.name))
  const firstImage = images.find((img) => img.name.includes('frame_0000')) ?? images[0]

  const cam = cameras.get(firstImage.cameraId)
  if (!cam) throw new Error(`Camera ${firstImage.cameraId} niet gevonden in cameras.bin`)

  const { position, quaternion } = colmapPoseToThreeJs(firstImage.qvec, firstImage.tvec)

  // fovY in degrees from fy and image height
  const fovY = 2 * Math.atan(cam.height / (2 * cam.fy)) * (180 / Math.PI)

  // Scene center and floor alignment from 3D points
  let sceneCenter: [number, number, number] = [0, 0, 0]
  let groupPositionY = 0
  try {
    const points = await parsePoints3DBin(points3DPath)
    if (points.length > 0) {
      let sx = 0, sy = 0, sz = 0
      for (const [x, y, z] of points) {
        sx += x; sy += y; sz += z
      }
      const n = points.length

      // Keep the splat in its COLMAP-local height. Earlier automatic floor
      // alignment used sparse-point percentiles, but that overcorrects for
      // splats and moves the room far above/below the product.
      groupPositionY = 0

      // Scene center in Three.js world (Y/Z flipped).
      sceneCenter = [sx / n, -(sy / n) + groupPositionY, -(sz / n)]
    }
  } catch {
    // points3D.bin optional - use origin
  }

  // Apply floor offset to camera position so it maintains the same view after group shift
  const adjustedPosition: [number, number, number] = [position[0], position[1] + groupPositionY, position[2]]

  return {
    position: adjustedPosition,
    quaternion,
    fovY,
    width: cam.width,
    height: cam.height,
    sceneCenter,
    groupPositionY,
  }
}
