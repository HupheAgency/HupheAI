var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/texture-projector-smoke.ts
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");

// src/main/lib/geometry-integrity.ts
var import_node_crypto = require("node:crypto");
var COMPONENT_BYTES = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4
};
var TYPE_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
};
var IDENTITY = [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1
];
function parseGlb(glb) {
  if (glb.length < 20 || glb.readUInt32LE(0) !== 1179937895) {
    throw new Error("Geometrycontrole ondersteunt alleen geldige GLB-bestanden.");
  }
  if (glb.readUInt32LE(4) !== 2) {
    throw new Error("Geometrycontrole ondersteunt alleen GLB versie 2.");
  }
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= glb.length) {
    const length = glb.readUInt32LE(offset);
    const type = glb.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > glb.length) throw new Error("GLB bevat een ongeldige chunklengte.");
    if (type === 1313821514) {
      json = JSON.parse(glb.subarray(start, end).toString("utf8").trim());
    } else if (type === 5130562 && !bin) {
      bin = glb.subarray(start, end);
    }
    offset = end;
  }
  if (!json || !bin) throw new Error("GLB mist een JSON- of BIN-chunk.");
  return { json, bin };
}
function readComponent(bin, offset, componentType, normalized = false) {
  let value;
  switch (componentType) {
    case 5120:
      value = bin.readInt8(offset);
      return normalized ? Math.max(value / 127, -1) : value;
    case 5121:
      value = bin.readUInt8(offset);
      return normalized ? value / 255 : value;
    case 5122:
      value = bin.readInt16LE(offset);
      return normalized ? Math.max(value / 32767, -1) : value;
    case 5123:
      value = bin.readUInt16LE(offset);
      return normalized ? value / 65535 : value;
    case 5125:
      value = bin.readUInt32LE(offset);
      return normalized ? value / 4294967295 : value;
    case 5126:
      return bin.readFloatLE(offset);
    default:
      throw new Error(`Niet-ondersteund accessor componentType: ${componentType}`);
  }
}
function readAccessor(parsed, accessorIndex) {
  const accessor = parsed.json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Accessor ${accessorIndex} ontbreekt.`);
  if (accessor.sparse) {
    throw new Error(`Sparse accessor ${accessorIndex} kan nog niet veilig worden gevalideerd.`);
  }
  const view = parsed.json.bufferViews?.[accessor.bufferView];
  if (!view || (view.buffer ?? 0) !== 0) {
    throw new Error(`Accessor ${accessorIndex} verwijst niet naar de ingebedde GLB-buffer.`);
  }
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  if (!componentBytes || !components) throw new Error(`Accessor ${accessorIndex} heeft een onbekend formaat.`);
  const stride = view.byteStride ?? componentBytes * components;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let i = 0; i < accessor.count; i++) {
    const row = [];
    for (let c = 0; c < components; c++) {
      row.push(readComponent(parsed.bin, base + i * stride + c * componentBytes, accessor.componentType, accessor.normalized));
    }
    values.push(row);
  }
  return values;
}
function multiplyMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return out;
}
function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix.map(Number);
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1
  ];
}
function transformPoint(matrix, point) {
  const [x, y, z] = point;
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const divisor = w && w !== 1 ? w : 1;
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / divisor,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / divisor,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / divisor
  ];
}
function normalizedTriangleNormal(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  const length = Math.hypot(...cross);
  return length > 0 ? [cross[0] / length, cross[1] / length, cross[2] / length] : [0, 0, 0];
}
function pointKey(point) {
  return point.map((value) => Math.round(value * 1e6)).join(",");
}
function triangleRecord(a, b, c) {
  const points = [a, b, c].sort((left, right) => pointKey(left).localeCompare(pointKey(right)));
  return {
    key: points.map(pointKey).join("|"),
    points,
    normal: normalizedTriangleNormal(a, b, c)
  };
}
function hashStrings(values) {
  const hash = (0, import_node_crypto.createHash)("sha256");
  for (const value of values) hash.update(value).update("\n");
  return hash.digest("hex");
}
function worldMatrices(json) {
  const nodes = json.nodes ?? [];
  const parents = /* @__PURE__ */ new Map();
  nodes.forEach((node, parent) => {
    for (const child of node.children ?? []) parents.set(child, parent);
  });
  const cache = /* @__PURE__ */ new Map();
  const resolve = (index) => {
    const known = cache.get(index);
    if (known) return known;
    const local = nodeMatrix(nodes[index] ?? {});
    const parent = parents.get(index);
    const world = parent === void 0 ? local : multiplyMat4(resolve(parent), local);
    cache.set(index, world);
    return world;
  };
  nodes.forEach((_node, index) => resolve(index));
  return cache;
}
function inspectGlbGeometry(glb) {
  const parsed = parseGlb(glb);
  const matrices = worldMatrices(parsed.json);
  const meshNodes = /* @__PURE__ */ new Map();
  for (const [nodeIndex, node] of (parsed.json.nodes ?? []).entries()) {
    if (node.mesh === void 0) continue;
    const list = meshNodes.get(node.mesh) ?? [];
    list.push({ node: nodeIndex, matrix: matrices.get(nodeIndex) ?? IDENTITY });
    meshNodes.set(node.mesh, list);
  }
  let primitiveCount = 0;
  let unsupportedPrimitiveCount = 0;
  let vertexCount = 0;
  let indexCount = 0;
  const triangles = [];
  const positionKeys = [];
  const transformKeys = [];
  const boundsMin = [Infinity, Infinity, Infinity];
  const boundsMax = [-Infinity, -Infinity, -Infinity];
  const meshes = parsed.json.meshes ?? [];
  meshes.forEach((mesh, meshIndex) => {
    const instances = meshNodes.get(meshIndex) ?? [{ node: -1, matrix: IDENTITY }];
    for (const instance of instances) {
      transformKeys.push(`${meshIndex}:${instance.node}:${instance.matrix.map((v) => v.toPrecision(15)).join(",")}`);
    }
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount++;
      const positionAccessor = primitive.attributes?.POSITION;
      if (positionAccessor === void 0) {
        unsupportedPrimitiveCount++;
        continue;
      }
      const positions = readAccessor(parsed, positionAccessor);
      const indices = primitive.indices === void 0 ? positions.map((_position, index) => index) : readAccessor(parsed, primitive.indices).map((row) => row[0]);
      vertexCount += positions.length;
      indexCount += primitive.indices === void 0 ? 0 : indices.length;
      if ((primitive.mode ?? 4) !== 4 || indices.length % 3 !== 0) {
        unsupportedPrimitiveCount++;
        continue;
      }
      for (const instance of instances) {
        const transformed = positions.map((position) => transformPoint(instance.matrix, position));
        for (const point of transformed) {
          positionKeys.push(pointKey(point));
          for (let axis = 0; axis < 3; axis++) {
            boundsMin[axis] = Math.min(boundsMin[axis], point[axis]);
            boundsMax[axis] = Math.max(boundsMax[axis], point[axis]);
          }
        }
        for (let i = 0; i < indices.length; i += 3) {
          const a = transformed[indices[i]];
          const b = transformed[indices[i + 1]];
          const c = transformed[indices[i + 2]];
          if (!a || !b || !c) throw new Error("Primitive bevat een index buiten de POSITION-accessor.");
          triangles.push(triangleRecord(a, b, c));
        }
      }
    }
  });
  triangles.sort((a, b) => a.key.localeCompare(b.key));
  positionKeys.sort();
  transformKeys.sort();
  if (!Number.isFinite(boundsMin[0])) {
    boundsMin.fill(0);
    boundsMax.fill(0);
  }
  const size = [
    boundsMax[0] - boundsMin[0],
    boundsMax[1] - boundsMin[1],
    boundsMax[2] - boundsMin[2]
  ];
  return {
    fingerprintVersion: 1,
    surfaceHash: hashStrings(triangles.map((triangle) => triangle.key)),
    positionHash: hashStrings(positionKeys),
    sceneTransformHash: hashStrings(transformKeys),
    meshCount: meshes.length,
    primitiveCount,
    unsupportedPrimitiveCount,
    vertexCount,
    indexCount,
    triangleCount: triangles.length,
    bounds: { min: boundsMin, max: boundsMax, size },
    triangles
  };
}
function maxBoundsDelta(input, output) {
  return Math.max(
    ...input.bounds.min.map((value, axis) => Math.abs(value - output.bounds.min[axis])),
    ...input.bounds.max.map((value, axis) => Math.abs(value - output.bounds.max[axis]))
  );
}
function surfaceDeviation(input, output) {
  if (input.triangles.length !== output.triangles.length) return { distance: null, normalAngle: null };
  let distance = 0;
  let normalAngle = 0;
  for (let i = 0; i < input.triangles.length; i++) {
    const left = input.triangles[i];
    const right = output.triangles[i];
    for (let point = 0; point < 3; point++) {
      distance = Math.max(
        distance,
        Math.hypot(
          left.points[point][0] - right.points[point][0],
          left.points[point][1] - right.points[point][1],
          left.points[point][2] - right.points[point][2]
        )
      );
    }
    const dot = Math.min(1, Math.max(-1, Math.abs(
      left.normal[0] * right.normal[0] + left.normal[1] * right.normal[1] + left.normal[2] * right.normal[2]
    )));
    normalAngle = Math.max(normalAngle, Math.acos(dot) * 180 / Math.PI);
  }
  return { distance, normalAngle };
}
function withoutTriangles(snapshot) {
  const { triangles: _triangles, ...summary } = snapshot;
  return summary;
}
function compareGlbGeometry(inputGlb, outputGlb, tolerance = 1e-5) {
  const input = inspectGlbGeometry(inputGlb);
  const output = inspectGlbGeometry(outputGlb);
  const boundsDelta = maxBoundsDelta(input, output);
  const deviation = surfaceDeviation(input, output);
  const failureReasons = [];
  if (input.unsupportedPrimitiveCount || output.unsupportedPrimitiveCount) {
    failureReasons.push("Niet alle primitives konden als driehoeksoppervlak worden gevalideerd.");
  }
  if (input.surfaceHash !== output.surfaceHash) {
    failureReasons.push("De zichtbare driehoeksoppervlakken verschillen.");
  }
  if (input.sceneTransformHash !== output.sceneTransformHash) {
    failureReasons.push("Node- of scene-transforms verschillen.");
  }
  if (boundsDelta > tolerance) {
    failureReasons.push(`De bounding box wijkt ${boundsDelta} af (tolerantie ${tolerance}).`);
  }
  if (deviation.distance !== null && deviation.distance > tolerance) {
    failureReasons.push(`De maximale oppervlakteafwijking is ${deviation.distance}.`);
  }
  return {
    geometry_preserved: failureReasons.length === 0,
    fingerprint_version: 1,
    tolerance,
    input: withoutTriangles(input),
    output: withoutTriangles(output),
    comparison: {
      surface_hash_equal: input.surfaceHash === output.surfaceHash,
      scene_transform_hash_equal: input.sceneTransformHash === output.sceneTransformHash,
      bounding_box_max_delta: boundsDelta,
      max_surface_deviation: deviation.distance,
      max_normal_angle_degrees: deviation.normalAngle,
      vertex_count_delta: output.vertexCount - input.vertexCount,
      index_count_delta: output.indexCount - input.indexCount,
      triangle_count_delta: output.triangleCount - input.triangleCount
    },
    failure_reasons: failureReasons
  };
}
function assertGlbGeometryPreserved(inputGlb, outputGlb, tolerance = 1e-5) {
  const diagnostics = compareGlbGeometry(inputGlb, outputGlb, tolerance);
  if (!diagnostics.geometry_preserved) {
    throw new Error(`Texture wrapping heeft de geometrie gewijzigd: ${diagnostics.failure_reasons.join(" ")}`);
  }
  return diagnostics;
}

// src/main/lib/texture-projector.ts
var CAMERA_CONFIGS = {
  front: { dx: 0, dy: 0, dz: -1, ux: 0, uy: 1, uz: 0 },
  hero: { dx: 0, dy: 0, dz: -1, ux: 0, uy: 1, uz: 0 },
  rear: { dx: 0, dy: 0, dz: 1, ux: 0, uy: 1, uz: 0 },
  left: { dx: 1, dy: 0, dz: 0, ux: 0, uy: 1, uz: 0 },
  right: { dx: -1, dy: 0, dz: 0, ux: 0, uy: 1, uz: 0 },
  top: { dx: 0, dy: -1, dz: 0, ux: 0, uy: 0, uz: -1 }
};
function parseGlb2(buf) {
  const magic = buf.readUInt32LE(0);
  if (magic !== 1179937895) throw new Error("Not a GLB file");
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  const binOffset = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binOffset);
  const binChunk = buf.slice(binOffset + 8, binOffset + 8 + binLen);
  return { json, binChunk };
}
function extractMesh(json, bin) {
  const mesh = json.meshes[0];
  const prim = mesh.primitives[0];
  const accessors = json.accessors;
  const bufferViews = json.bufferViews;
  function getTypedArray(accIdx) {
    const acc = accessors[accIdx];
    const bv = bufferViews[acc.bufferView];
    const baseOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const componentType = acc.componentType;
    const components = acc.type === "VEC3" ? 3 : acc.type === "VEC2" ? 2 : 1;
    const stride = bv.byteStride || 0;
    const bytesPerElement = componentType === 5126 || componentType === 5125 ? 4 : 2;
    const tightStride = components * bytesPerElement;
    if (stride > 0 && stride !== tightStride) {
      const count2 = acc.count;
      if (componentType === 5126) {
        const out = new Float32Array(count2 * components);
        for (let i = 0; i < count2; i++) {
          const srcOff = bin.byteOffset + baseOffset + i * stride;
          for (let c = 0; c < components; c++) {
            out[i * components + c] = new DataView(bin.buffer).getFloat32(srcOff + c * 4, true);
          }
        }
        return out;
      }
      if (componentType === 5123) {
        const out = new Uint16Array(count2 * components);
        for (let i = 0; i < count2; i++) {
          const srcOff = bin.byteOffset + baseOffset + i * stride;
          for (let c = 0; c < components; c++) {
            out[i * components + c] = new DataView(bin.buffer).getUint16(srcOff + c * 2, true);
          }
        }
        return out;
      }
      if (componentType === 5125) {
        const out = new Uint32Array(count2 * components);
        for (let i = 0; i < count2; i++) {
          const srcOff = bin.byteOffset + baseOffset + i * stride;
          for (let c = 0; c < components; c++) {
            out[i * components + c] = new DataView(bin.buffer).getUint32(srcOff + c * 4, true);
          }
        }
        return out;
      }
      throw new Error(`Unsupported componentType: ${componentType}`);
    }
    const count = acc.count * components;
    if (componentType === 5126) return new Float32Array(bin.buffer, bin.byteOffset + baseOffset, count);
    if (componentType === 5123) return new Uint16Array(bin.buffer, bin.byteOffset + baseOffset, count);
    if (componentType === 5125) return new Uint32Array(bin.buffer, bin.byteOffset + baseOffset, count);
    throw new Error(`Unsupported componentType: ${componentType}`);
  }
  const positions = getTypedArray(prim.attributes.POSITION);
  const normals = prim.attributes.NORMAL !== void 0 ? getTypedArray(prim.attributes.NORMAL) : null;
  const uvs = getTypedArray(prim.attributes.TEXCOORD_0);
  let indices = null;
  let triCount;
  if (prim.indices !== void 0) {
    indices = getTypedArray(prim.indices);
    triCount = indices.length / 3;
  } else {
    triCount = positions.length / 3 / 3;
  }
  return { positions, normals, uvs, indices, triCount };
}
function computeBBox(mesh) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const vCount = mesh.positions.length / 3;
  for (let i = 0; i < vCount; i++) {
    const x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1], z = mesh.positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    cx,
    cy,
    cz,
    radius: Math.sqrt(dx * dx + dy * dy + dz * dz) / 2
  };
}
function detectBackground(pixels, w, h) {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [1, 0],
    [0, 1],
    [w - 2, 0],
    [w - 1, 1],
    [0, h - 2],
    [1, h - 1],
    [w - 2, h - 1],
    [w - 1, h - 2]
  ];
  for (const [x, y] of corners) {
    const off = (y * w + x) * 4;
    rSum += pixels[off];
    gSum += pixels[off + 1];
    bSum += pixels[off + 2];
    count++;
  }
  return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
}
function isBackground(pixels, off, bgR, bgG, bgB, threshold = 30) {
  const dr = pixels[off] - bgR, dg = pixels[off + 1] - bgG, db = pixels[off + 2] - bgB;
  return dr * dr + dg * dg + db * db < threshold * threshold;
}
function detectObjectSilhouette(pixels, w, h, bgR, bgG, bgB) {
  const pixelCount = w * h;
  const candidate = new Uint8Array(pixelCount);
  const threshold = 22;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      if (!isBackground(pixels, off, bgR, bgG, bgB, threshold)) {
        candidate[y * w + x] = 1;
      }
    }
  }
  const labels = new Int32Array(pixelCount);
  labels.fill(-1);
  const queue = new Int32Array(pixelCount);
  const components = [];
  let nextLabel = 0;
  for (let seed = 0; seed < pixelCount; seed++) {
    if (!candidate[seed] || labels[seed] !== -1) continue;
    let read = 0;
    let write = 0;
    queue[write++] = seed;
    labels[seed] = nextLabel;
    let count = 0;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    while (read < write) {
      const index = queue[read++];
      const x = index % w;
      const y = Math.floor(index / w);
      count++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy;
        if (ny < 0 || ny >= h) continue;
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = x + ox;
          if (nx < 0 || nx >= w) continue;
          const neighbor = ny * w + nx;
          if (!candidate[neighbor] || labels[neighbor] !== -1) continue;
          labels[neighbor] = nextLabel;
          queue[write++] = neighbor;
        }
      }
    }
    components.push({ label: nextLabel, count, minX, minY, maxX, maxY });
    nextLabel++;
  }
  const minimumPixels = Math.max(64, Math.round(pixelCount * 1e-3));
  const centerMinX = w * 0.2;
  const centerMaxX = w * 0.8;
  const centerMinY = h * 0.03;
  const centerMaxY = h * 0.97;
  const selected = components.filter(
    (component) => component.count >= minimumPixels && component.maxX >= centerMinX && component.minX <= centerMaxX && component.maxY >= centerMinY && component.minY <= centerMaxY
  ).sort((left, right) => right.count - left.count)[0];
  if (!selected) {
    throw new Error("Canonical view bevat geen herkenbaar product tegen de achtergrond.");
  }
  const foreground = new Uint8Array(pixelCount);
  for (let y = selected.minY; y <= selected.maxY; y++) {
    let rowMin = w;
    let rowMax = -1;
    for (let x = selected.minX; x <= selected.maxX; x++) {
      if (labels[y * w + x] !== selected.label) continue;
      rowMin = Math.min(rowMin, x);
      rowMax = Math.max(rowMax, x);
    }
    if (rowMax < rowMin) continue;
    for (let x = rowMin; x <= rowMax; x++) foreground[y * w + x] = 1;
  }
  return {
    minX: selected.minX,
    minY: selected.minY,
    maxX: selected.maxX,
    maxY: selected.maxY,
    foreground
  };
}
function buildCamera(angle, cfg, pixels, w, h, bgR, bgG, bgB, mesh, bounds) {
  const len = Math.sqrt(cfg.dx * cfg.dx + cfg.dy * cfg.dy + cfg.dz * cfg.dz);
  const dx = cfg.dx / len, dy = cfg.dy / len, dz = cfg.dz / len;
  const rx = dy * cfg.uz - dz * cfg.uy;
  const ry = dz * cfg.ux - dx * cfg.uz;
  const rz = dx * cfg.uy - dy * cfg.ux;
  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const ux = ry * dz - rz * dy;
  const uy = rz * dx - rx * dz;
  const uz = rx * dy - ry * dx;
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const objectBounds = detectObjectSilhouette(pixels, w, h, bgR, bgG, bgB);
  let meshMinR = Infinity;
  let meshMaxR = -Infinity;
  let meshMinU = Infinity;
  let meshMaxU = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] - bounds.cx;
    const y = mesh.positions[i + 1] - bounds.cy;
    const z = mesh.positions[i + 2] - bounds.cz;
    const projectedR = x * (rx / rLen) + y * (ry / rLen) + z * (rz / rLen);
    const projectedU = x * (ux / uLen) + y * (uy / uLen) + z * (uz / uLen);
    meshMinR = Math.min(meshMinR, projectedR);
    meshMaxR = Math.max(meshMaxR, projectedR);
    meshMinU = Math.min(meshMinU, projectedU);
    meshMaxU = Math.max(meshMaxU, projectedU);
  }
  return {
    angle,
    dx,
    dy,
    dz,
    rx: rx / rLen,
    ry: ry / rLen,
    rz: rz / rLen,
    ux: ux / uLen,
    uy: uy / uLen,
    uz: uz / uLen,
    pixels,
    w,
    h,
    foreground: objectBounds.foreground,
    bgR,
    bgG,
    bgB,
    objectMinX: objectBounds.minX,
    objectMinY: objectBounds.minY,
    objectMaxX: objectBounds.maxX,
    objectMaxY: objectBounds.maxY,
    meshMinR,
    meshMaxR,
    meshMinU,
    meshMaxU,
    depth: new Float32Array(w * h).fill(Infinity)
  };
}
function projectPoint(camera, bounds, x, y, z) {
  const px = x - bounds.cx;
  const py = y - bounds.cy;
  const pz = z - bounds.cz;
  const projectedR = px * camera.rx + py * camera.ry + pz * camera.rz;
  const projectedU = px * camera.ux + py * camera.uy + pz * camera.uz;
  const rangeR = Math.max(1e-8, camera.meshMaxR - camera.meshMinR);
  const rangeU = Math.max(1e-8, camera.meshMaxU - camera.meshMinU);
  return {
    x: camera.objectMinX + (projectedR - camera.meshMinR) / rangeR * (camera.objectMaxX - camera.objectMinX),
    y: camera.objectMaxY - (projectedU - camera.meshMinU) / rangeU * (camera.objectMaxY - camera.objectMinY),
    depth: px * camera.dx + py * camera.dy + pz * camera.dz
  };
}
function triangleVertexIndices(mesh, triangle) {
  return mesh.indices ? [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]] : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
}
function barycentric(px, py, a, b, c) {
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < 1e-10) return null;
  const w0 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / denominator;
  const w1 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / denominator;
  return [w0, w1, 1 - w0 - w1];
}
function buildDepthBuffer(mesh, bounds, camera) {
  for (let triangle = 0; triangle < mesh.triCount; triangle++) {
    const [i0, i1, i2] = triangleVertexIndices(mesh, triangle);
    const projected = [i0, i1, i2].map((index) => projectPoint(
      camera,
      bounds,
      mesh.positions[index * 3],
      mesh.positions[index * 3 + 1],
      mesh.positions[index * 3 + 2]
    ));
    const minX = Math.max(0, Math.floor(Math.min(...projected.map((point) => point.x))));
    const maxX = Math.min(camera.w - 1, Math.ceil(Math.max(...projected.map((point) => point.x))));
    const minY = Math.max(0, Math.floor(Math.min(...projected.map((point) => point.y))));
    const maxY = Math.min(camera.h - 1, Math.ceil(Math.max(...projected.map((point) => point.y))));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const weights = barycentric(x + 0.5, y + 0.5, projected[0], projected[1], projected[2]);
        if (!weights || weights.some((weight) => weight < -1e-3)) continue;
        const depth = projected[0].depth * weights[0] + projected[1].depth * weights[1] + projected[2].depth * weights[2];
        const offset = y * camera.w + x;
        if (depth < camera.depth[offset]) camera.depth[offset] = depth;
      }
    }
  }
}
function dilateAtlas(source, size, passes = 10) {
  let current = Buffer.from(source);
  for (let pass = 0; pass < passes; pass++) {
    const next = Buffer.from(current);
    let changed = false;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;
        if (current[offset + 3] !== 0) continue;
        let count = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
          const neighbor = (ny * size + nx) * 4;
          if (current[neighbor + 3] === 0) continue;
          r += current[neighbor];
          g += current[neighbor + 1];
          b += current[neighbor + 2];
          count++;
        }
        if (!count) continue;
        next[offset] = Math.round(r / count);
        next[offset + 1] = Math.round(g / count);
        next[offset + 2] = Math.round(b / count);
        next[offset + 3] = 255;
        changed = true;
      }
    }
    current = next;
    if (!changed) break;
  }
  return current;
}
function foregroundMedianColor(cameras) {
  const red = [];
  const green = [];
  const blue = [];
  for (const camera of cameras) {
    const step = Math.max(1, Math.floor(Math.sqrt(camera.w * camera.h / 12e3)));
    for (let y = 0; y < camera.h; y += step) {
      for (let x = 0; x < camera.w; x += step) {
        if (!camera.foreground[y * camera.w + x]) continue;
        const offset = (y * camera.w + x) * 4;
        red.push(camera.pixels[offset]);
        green.push(camera.pixels[offset + 1]);
        blue.push(camera.pixels[offset + 2]);
      }
    }
  }
  if (red.length === 0) return [224, 224, 224];
  red.sort((a, b) => a - b);
  green.sort((a, b) => a - b);
  blue.sort((a, b) => a - b);
  const middle = Math.floor(red.length / 2);
  return [red[middle], green[middle], blue[middle]];
}
function fillTransparentAtlas(atlas, color) {
  const filled = Buffer.from(atlas);
  for (let offset = 0; offset < filled.length; offset += 4) {
    if (filled[offset + 3] !== 0) continue;
    filled[offset] = color[0];
    filled[offset + 1] = color[1];
    filled[offset + 2] = color[2];
    filled[offset + 3] = 255;
  }
  return filled;
}
async function projectTexture(input) {
  const sharp = (await import("sharp")).default;
  const atlasSize = input.atlasSize ?? 2048;
  console.log("[texture-projector] Start. GLB size:", input.glbBuffer.length, "views:", input.views.length, "atlas:", atlasSize);
  console.log("[texture-projector] Parsing GLB (raw)...");
  const { json, binChunk } = parseGlb2(input.glbBuffer);
  if ((json.meshes?.length ?? 0) !== 1 || (json.meshes?.[0]?.primitives?.length ?? 0) !== 1) {
    throw new Error("Texture bake ondersteunt momenteel exact \xE9\xE9n meshprimitive; de Basic Shape is niet aangepast.");
  }
  console.log("[texture-projector] GLB parsed. Extracting mesh...");
  const mesh = extractMesh(json, binChunk);
  console.log("[texture-projector] Mesh:", mesh.triCount, "triangles,", mesh.positions.length / 3, "vertices");
  const bbox = computeBBox(mesh);
  console.log("[texture-projector] BBox center:", bbox.cx.toFixed(3), bbox.cy.toFixed(3), bbox.cz.toFixed(3), "radius:", bbox.radius.toFixed(3));
  const cameras = [];
  for (const view of input.views) {
    const cfg = CAMERA_CONFIGS[view.angle] ?? CAMERA_CONFIGS.front;
    const meta = await sharp(view.imageBuffer).metadata();
    const w = meta.width ?? 512, h = meta.height ?? 512;
    const rawPixels = await sharp(view.imageBuffer).resize({ width: w, height: h }).raw().ensureAlpha().toBuffer();
    const [bgR, bgG, bgB] = detectBackground(rawPixels, w, h);
    const camera = buildCamera(view.angle, cfg, rawPixels, w, h, bgR, bgG, bgB, mesh, bbox);
    buildDepthBuffer(mesh, bbox, camera);
    cameras.push(camera);
    console.log(
      "[texture-projector] Camera:",
      view.angle,
      w,
      "x",
      h,
      "object:",
      camera.objectMinX,
      camera.objectMinY,
      camera.objectMaxX,
      camera.objectMaxY
    );
  }
  const atlas = Buffer.alloc(atlasSize * atlasSize * 4, 0);
  let texturedCount = 0;
  let atlasTexelsFilled = 0;
  const logEvery = Math.max(1, Math.floor(mesh.triCount / 10));
  const depthTolerance = Math.max(1e-5, bbox.radius * 8e-3);
  for (let t = 0; t < mesh.triCount; t++) {
    if (t % logEvery === 0) console.log(`[texture-projector] ${t}/${mesh.triCount}`);
    const [i0, i1, i2] = triangleVertexIndices(mesh, t);
    const p0x = mesh.positions[i0 * 3], p0y = mesh.positions[i0 * 3 + 1], p0z = mesh.positions[i0 * 3 + 2];
    const p1x = mesh.positions[i1 * 3], p1y = mesh.positions[i1 * 3 + 1], p1z = mesh.positions[i1 * 3 + 2];
    const p2x = mesh.positions[i2 * 3], p2y = mesh.positions[i2 * 3 + 1], p2z = mesh.positions[i2 * 3 + 2];
    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nLen < 1e-10) continue;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;
    const rankedCameras = cameras.map((camera) => ({
      camera,
      score: -(nx * camera.dx + ny * camera.dy + nz * camera.dz)
    })).filter((candidate) => candidate.score > 0.02).sort((left, right) => right.score - left.score);
    if (rankedCameras.length === 0) continue;
    const uv0u = mesh.uvs[i0 * 2] * atlasSize, uv0v = mesh.uvs[i0 * 2 + 1] * atlasSize;
    const uv1u = mesh.uvs[i1 * 2] * atlasSize, uv1v = mesh.uvs[i1 * 2 + 1] * atlasSize;
    const uv2u = mesh.uvs[i2 * 2] * atlasSize, uv2v = mesh.uvs[i2 * 2 + 1] * atlasSize;
    const minY = Math.max(0, Math.floor(Math.min(uv0v, uv1v, uv2v)));
    const maxY = Math.min(atlasSize - 1, Math.ceil(Math.max(uv0v, uv1v, uv2v)));
    let filled = false;
    for (let py = minY; py <= maxY; py++) {
      const scanY = py + 0.5;
      const edges = [];
      const eu = [uv0u, uv1u, uv2u, uv0u];
      const ev = [uv0v, uv1v, uv2v, uv0v];
      for (let e = 0; e < 3; e++) {
        const y0 = ev[e], y1 = ev[e + 1];
        if (y0 <= scanY && y1 > scanY || y1 <= scanY && y0 > scanY) {
          edges.push(eu[e] + (scanY - y0) / (y1 - y0) * (eu[e + 1] - eu[e]));
        }
      }
      if (edges.length < 2) continue;
      if (edges[0] > edges[1]) {
        const tmp = edges[0];
        edges[0] = edges[1];
        edges[1] = tmp;
      }
      const startX = Math.max(0, Math.floor(edges[0]));
      const endX = Math.min(atlasSize - 1, Math.ceil(edges[1]));
      for (let px = startX; px <= endX; px++) {
        const u = (px + 0.5) / atlasSize;
        const v = (py + 0.5) / atlasSize;
        const denom = (uv1v / atlasSize - uv2v / atlasSize) * (uv0u / atlasSize - uv2u / atlasSize) + (uv2u / atlasSize - uv1u / atlasSize) * (uv0v / atlasSize - uv2v / atlasSize);
        if (Math.abs(denom) < 1e-10) continue;
        const w0 = ((uv1v / atlasSize - uv2v / atlasSize) * (u - uv2u / atlasSize) + (uv2u / atlasSize - uv1u / atlasSize) * (v - uv2v / atlasSize)) / denom;
        const w1 = ((uv2v / atlasSize - uv0v / atlasSize) * (u - uv2u / atlasSize) + (uv0u / atlasSize - uv2u / atlasSize) * (v - uv2v / atlasSize)) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-3 || w1 < -1e-3 || w2 < -1e-3) continue;
        const wx = p0x * w0 + p1x * w1 + p2x * w2;
        const wy = p0y * w0 + p1y * w1 + p2y * w2;
        const wz = p0z * w0 + p1z * w1 + p2z * w2;
        let sample = null;
        for (const candidate of rankedCameras) {
          const projected = projectPoint(candidate.camera, bbox, wx, wy, wz);
          const imgX = Math.round(projected.x);
          const imgY = Math.round(projected.y);
          if (imgX < 0 || imgX >= candidate.camera.w || imgY < 0 || imgY >= candidate.camera.h) continue;
          const depth = candidate.camera.depth[imgY * candidate.camera.w + imgX];
          if (!Number.isFinite(depth) || projected.depth > depth + depthTolerance) continue;
          if (!candidate.camera.foreground[imgY * candidate.camera.w + imgX]) continue;
          sample = { camera: candidate.camera, x: imgX, y: imgY };
          break;
        }
        if (!sample) continue;
        const srcOff = (sample.y * sample.camera.w + sample.x) * 4;
        const flippedY = atlasSize - 1 - py;
        const dstOff = (flippedY * atlasSize + px) * 4;
        if (atlas[dstOff + 3] === 0) atlasTexelsFilled++;
        atlas[dstOff] = sample.camera.pixels[srcOff];
        atlas[dstOff + 1] = sample.camera.pixels[srcOff + 1];
        atlas[dstOff + 2] = sample.camera.pixels[srcOff + 2];
        atlas[dstOff + 3] = 255;
        filled = true;
      }
    }
    if (filled) texturedCount++;
  }
  console.log("[texture-projector] Textured", texturedCount, "/", mesh.triCount, "triangles");
  const dilatedAtlas = dilateAtlas(atlas, atlasSize);
  const fallbackColor = foregroundMedianColor(cameras);
  const completedAtlas = fillTransparentAtlas(dilatedAtlas, fallbackColor);
  console.log("[texture-projector] Fallback color:", fallbackColor.join(", "));
  const atlasBuffer = await sharp(completedAtlas, { raw: { width: atlasSize, height: atlasSize, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer();
  console.log("[texture-projector] Atlas PNG:", atlasBuffer.length, "bytes");
  const texturedGlbBuffer = buildTexturedGlb(input.glbBuffer, json, binChunk, atlasBuffer);
  console.log("[texture-projector] Textured GLB:", texturedGlbBuffer.length, "bytes");
  return {
    texturedGlbBuffer,
    atlasBuffer,
    manifest: {
      atlas_size: atlasSize,
      views_used: input.views.map((v) => v.angle),
      triangles_textured: texturedCount,
      triangles_total: mesh.triCount,
      atlas_texels_filled: atlasTexelsFilled,
      atlas_coverage: atlasTexelsFilled / (atlasSize * atlasSize),
      triangle_coverage: texturedCount / mesh.triCount,
      fallback_color: fallbackColor,
      view_bounds: cameras.map((camera) => ({
        angle: camera.angle,
        minX: camera.objectMinX,
        minY: camera.objectMinY,
        maxX: camera.objectMaxX,
        maxY: camera.objectMaxY
      }))
    }
  };
}
function buildTexturedGlb(originalGlb, gltfJson, binChunk, pngAtlas) {
  const json = JSON.parse(JSON.stringify(gltfJson));
  const pngOffset = binChunk.length;
  const paddedPngLen = Math.ceil(pngAtlas.length / 4) * 4;
  const newBin = Buffer.alloc(binChunk.length + paddedPngLen);
  binChunk.copy(newBin);
  pngAtlas.copy(newBin, pngOffset);
  if (!json.bufferViews) json.bufferViews = [];
  const pngBvIdx = json.bufferViews.length;
  json.bufferViews.push({
    buffer: 0,
    byteOffset: pngOffset,
    byteLength: pngAtlas.length
  });
  json.buffers[0].byteLength = newBin.length;
  json.images = [{ bufferView: pngBvIdx, mimeType: "image/png" }];
  json.textures = [{ source: 0 }];
  if (json.extensionsUsed) {
    json.extensionsUsed = json.extensionsUsed.filter((e) => e !== "EXT_texture_webp");
    if (json.extensionsUsed.length === 0) delete json.extensionsUsed;
  }
  if (json.extensionsRequired) {
    json.extensionsRequired = json.extensionsRequired.filter((e) => e !== "EXT_texture_webp");
    if (json.extensionsRequired.length === 0) delete json.extensionsRequired;
  }
  if (!json.materials) json.materials = [];
  if (json.materials.length === 0) {
    json.materials.push({
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 0.5
      },
      doubleSided: true
    });
  } else {
    for (const mat of json.materials) {
      if (!mat.pbrMetallicRoughness) mat.pbrMetallicRoughness = {};
      mat.pbrMetallicRoughness.baseColorTexture = { index: 0 };
      mat.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
      mat.pbrMetallicRoughness.metallicFactor = 0;
      mat.pbrMetallicRoughness.roughnessFactor = 0.5;
      mat.doubleSided = true;
      delete mat.pbrMetallicRoughness.metallicRoughnessTexture;
      delete mat.normalTexture;
      delete mat.occlusionTexture;
      delete mat.emissiveTexture;
    }
  }
  for (const m of json.meshes) {
    for (const p of m.primitives) {
      if (p.material === void 0) p.material = 0;
    }
  }
  const jsonStr = JSON.stringify(json);
  const jsonBuf = Buffer.from(jsonStr, "utf8");
  const paddedJsonLen = Math.ceil(jsonBuf.length / 4) * 4;
  const paddedJson = Buffer.alloc(paddedJsonLen, 32);
  jsonBuf.copy(paddedJson);
  const totalLen = 12 + 8 + paddedJsonLen + 8 + newBin.length;
  const glb = Buffer.alloc(totalLen);
  glb.writeUInt32LE(1179937895, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLen, 8);
  glb.writeUInt32LE(paddedJsonLen, 12);
  glb.writeUInt32LE(1313821514, 16);
  paddedJson.copy(glb, 20);
  const binStart = 20 + paddedJsonLen;
  glb.writeUInt32LE(newBin.length, binStart);
  glb.writeUInt32LE(5130562, binStart + 4);
  newBin.copy(glb, binStart + 8);
  return glb;
}

// scripts/texture-projector-smoke.ts
async function main() {
  const [basePath, outputDir, ...viewArgs] = process.argv.slice(2);
  if (!basePath || !outputDir || viewArgs.length === 0) {
    throw new Error("Gebruik: texture-projector-smoke <base.glb> <output-dir> front=/pad.png left=/pad.png ...");
  }
  const views = await Promise.all(viewArgs.map(async (argument) => {
    const separator = argument.indexOf("=");
    if (separator < 1) throw new Error(`Ongeldige view: ${argument}`);
    return {
      angle: argument.slice(0, separator),
      imageBuffer: await (0, import_promises.readFile)(argument.slice(separator + 1))
    };
  }));
  const glbBuffer = await (0, import_promises.readFile)(basePath);
  const result = await projectTexture({
    glbBuffer,
    views,
    atlasSize: Number(process.env.ATLAS_SIZE ?? 1024)
  });
  const integrity = assertGlbGeometryPreserved(glbBuffer, result.texturedGlbBuffer);
  await (0, import_promises.mkdir)(outputDir, { recursive: true });
  await Promise.all([
    (0, import_promises.writeFile)((0, import_node_path.join)(outputDir, "textured.glb"), result.texturedGlbBuffer),
    (0, import_promises.writeFile)((0, import_node_path.join)(outputDir, "atlas.png"), result.atlasBuffer),
    (0, import_promises.writeFile)((0, import_node_path.join)(outputDir, "manifest.json"), JSON.stringify({ ...result.manifest, integrity }, null, 2))
  ]);
  console.log(JSON.stringify({ ...result.manifest, integrity }, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
