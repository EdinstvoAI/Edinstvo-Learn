// @ts-nocheck

// Property metadata is only used in Figma Design, so this is a no-op.
function defineProperties(
  _component: unknown,
  _properties: unknown,
): void {}

export default function Effect() { }
function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
function numberParam(params, name, fallback) {
    return finiteNumber(params[name], fallback);
}
function writeGradientParam(data, params, name, fallback) {
    const value = params[name];
    const stops = value && Array.isArray(value.stops) && value.stops.length > 0
        ? value.stops
        : fallback;
    const count = Math.min(stops.length, 8);
    data.fill(0, 0, 41);
    for (let i = 0; i < count; i++) {
        const stop = stops[i];
        const color = stop && stop.color;
        data[i * 4] = finiteNumber(color && color.r, 0);
        data[i * 4 + 1] = finiteNumber(color && color.g, 0);
        data[i * 4 + 2] = finiteNumber(color && color.b, 0);
        data[i * 4 + 3] = finiteNumber(color && color.a, 1);
        data[32 + i] = finiteNumber(stop && stop.position, 0);
    }
    data[40] = count;
}
function writeBufferIfChanged(device, buffer, data, lastData) {
    let changed = false;
    for (let i = 0; i < data.length; i++) {
        if (!Object.is(data[i], lastData[i])) {
            changed = true;
            break;
        }
    }
    if (changed) {
        device.queue.writeBuffer(buffer, 0, data);
        lastData.set(data);
    }
}
export function setup(device, frame) {
    const vertexWGSL = `
struct VsIn {
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
};

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}
`;
    const blurWGSL = `
struct BlurUniforms {
  sigma: f32,
  texelW: f32,
  texelH: f32,
  pad: f32,
};

@group(0) @binding(0) var<uniform> u: BlurUniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn gauss(x: f32, s: f32) -> f32 {
  return exp(-0.5 * (x / s) * (x / s));
}

@fragment
fn h_fs(in: VsOut) -> @location(0) vec4f {
  let sig = max(u.sigma, 0.001);
  let r = min(i32(ceil(sig * 3.0)), 32);
  var weightSum = 0.0;
  var accumulated = 0.0;
  for (var i = -r; i <= r; i = i + 1) {
    let p = in.uv + vec2f(f32(i) * u.texelW, 0.0);
    let inBounds = step(vec2f(0.0), p) * step(p, vec2f(1.0));
    let alpha =
      textureSampleLevel(
        inputTex,
        samp,
        clamp(p, vec2f(0.0), vec2f(1.0)),
        0.0,
      ).a * (inBounds.x * inBounds.y);
    let weight = gauss(f32(i), sig);
    accumulated += alpha * weight;
    weightSum += weight;
  }
  let value = accumulated / weightSum;
  return vec4f(value, value, value, value);
}

@fragment
fn v_fs(in: VsOut) -> @location(0) vec4f {
  let sig = max(u.sigma, 0.001);
  let r = min(i32(ceil(sig * 3.0)), 32);
  var weightSum = 0.0;
  var accumulated = 0.0;
  for (var i = -r; i <= r; i = i + 1) {
    let p = in.uv + vec2f(0.0, f32(i) * u.texelH);
    let inBounds = step(vec2f(0.0), p) * step(p, vec2f(1.0));
    let alpha =
      textureSampleLevel(
        inputTex,
        samp,
        clamp(p, vec2f(0.0), vec2f(1.0)),
        0.0,
      ).r * (inBounds.x * inBounds.y);
    let weight = gauss(f32(i), sig);
    accumulated += alpha * weight;
    weightSum += weight;
  }
  let value = accumulated / weightSum;
  return vec4f(value, value, value, value);
}
`;
    const mainWGSL = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  chromeGradient_c0: vec4f,
  chromeGradient_c1: vec4f,
  chromeGradient_c2: vec4f,
  chromeGradient_c3: vec4f,
  chromeGradient_c4: vec4f,
  chromeGradient_c5: vec4f,
  chromeGradient_c6: vec4f,
  chromeGradient_c7: vec4f,
  chromeGradient_pos0: vec4f,
  chromeGradient_pos1: vec4f,
  chromeGradient_count: f32,
  heightIntensity: f32,
  chromaSeparation: f32,
  noiseScale: f32,
  phase: f32,
  evolution: f32,
  noiseAngle: f32,
  stretch: f32,
  gradientOffset: f32,
  gradientRepeats: f32,
  roughness: f32,
  pad0: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var blurredAlphaTex: texture_2d<f32>;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn sampleInput(p: vec2f) -> vec4f {
  return textureSampleLevel(
    inputTex,
    samp,
    clamp(p, vec2f(0.0), vec2f(1.0)),
    0.0,
  );
}

fn chromeStopPos(i: u32) -> f32 {
  let lane = i & 3u;
  if (i < 4u) {
    return u.chromeGradient_pos0[lane];
  }
  return u.chromeGradient_pos1[lane];
}

fn chromeGradientRamp(t: f32) -> vec4f {
  let colors = array<vec4f, 8>(
    u.chromeGradient_c0,
    u.chromeGradient_c1,
    u.chromeGradient_c2,
    u.chromeGradient_c3,
    u.chromeGradient_c4,
    u.chromeGradient_c5,
    u.chromeGradient_c6,
    u.chromeGradient_c7,
  );
  let count = u32(u.chromeGradient_count);
  if (count == 0u) {
    return vec4f(0.0);
  }
  if (count == 1u || t <= chromeStopPos(0u)) {
    return colors[0];
  }
  let last = count - 1u;
  if (t >= chromeStopPos(last)) {
    return colors[last];
  }
  for (var i = 0u; i < last; i = i + 1u) {
    let p1 = chromeStopPos(i + 1u);
    if (t <= p1) {
      let p0 = chromeStopPos(i);
      return mix(
        colors[i],
        colors[i + 1u],
        (t - p0) / max(p1 - p0, 1e-5),
      );
    }
  }
  return colors[last];
}

fn aaGradientLookup(rawH: f32, offset: f32) -> vec4f {
  let shifted = rawH + offset;
  let wrapped = fract(shifted);
  let filterWidth = max(fwidth(shifted), 1e-5);
  let distance = min(wrapped, 1.0 - wrapped);
  let blend = saturate(distance / (filterWidth * 1.5));
  let other = select(wrapped + 1.0, wrapped - 1.0, wrapped > 0.5);
  return mix(
    chromeGradientRamp(clamp(other, 0.0, 1.0)),
    chromeGradientRamp(wrapped),
    blend,
  );
}

const TILE_PERIOD: f32 = 8.0;
const OCTAVES: u32 = 1u;

fn hash3(p: vec3f) -> f32 {
  var q = p;
  q = fract(q * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn smoothNoise3T(p: vec3f, tilePeriod: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  let wx0 = i.x - floor(i.x / tilePeriod) * tilePeriod;
  let x1w = (i.x + 1.0) - floor((i.x + 1.0) / tilePeriod) * tilePeriod;
  let wz0 = i.z - floor(i.z / tilePeriod) * tilePeriod;
  let z1w = (i.z + 1.0) - floor((i.z + 1.0) / tilePeriod) * tilePeriod;
  let y0 = i.y;
  let y1 = i.y + 1.0;
  let v000 = hash3(vec3f(wx0, y0, wz0));
  let v100 = hash3(vec3f(x1w, y0, wz0));
  let v010 = hash3(vec3f(wx0, y1, wz0));
  let v110 = hash3(vec3f(x1w, y1, wz0));
  let v001 = hash3(vec3f(wx0, y0, z1w));
  let v101 = hash3(vec3f(x1w, y0, z1w));
  let v011 = hash3(vec3f(wx0, y1, z1w));
  let v111 = hash3(vec3f(x1w, y1, z1w));
  return mix(
    mix(mix(v000, v100, s.x), mix(v010, v110, s.x), s.y),
    mix(mix(v001, v101, s.x), mix(v011, v111, s.x), s.y),
    s.z,
  );
}

fn fbm3(p: vec3f) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var frequency = 1.0;
  var totalAmplitude = 0.0;
  for (var i = 0u; i < 8u; i = i + 1u) {
    if (i >= OCTAVES) {
      break;
    }
    totalAmplitude += amplitude;
    value += amplitude * smoothNoise3T(
      p * frequency,
      TILE_PERIOD * frequency,
    );
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value / max(totalAmplitude, 1e-5);
}

fn heightAt(np: vec3f, hi: f32, edgeMask: f32, eps: f32) -> f32 {
  let noiseValue = fbm3(np);
  let dnx = fbm3(np + vec3f(eps, 0.0, 0.0)) -
    fbm3(np - vec3f(eps, 0.0, 0.0));
  let dny = fbm3(np + vec3f(0.0, eps, 0.0)) -
    fbm3(np - vec3f(0.0, eps, 0.0));
  return mix(0.5, noiseValue * edgeMask, hi) +
    (dnx + dny) * 0.5 * hi * 0.3;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let heightIntensity = u.heightIntensity / 100.0;
  let chromaSeparation = u.chromaSeparation / 1000.0;
  let noiseScale = max(0.01, u.noiseScale / 100.0);
  let stretchY = max(0.01, u.stretch / 100.0);
  let gradientOffset = u.gradientOffset / 100.0;
  let phaseX = (u.phase / 100.0) * TILE_PERIOD;
  let evolutionZ = (u.evolution / 100.0) * TILE_PERIOD;

  let angle = u.noiseAngle * (3.14159265 / 180.0);
  let cosA = cos(angle);
  let sinA = sin(angle);
  let centeredUv = uv - vec2f(0.5);
  let rotatedUv = vec2f(
    centeredUv.x * cosA - centeredUv.y * sinA,
    centeredUv.x * sinA + centeredUv.y * cosA,
  ) + vec2f(0.5);

  let inputColor = sampleInput(uv);
  let edgeMask = textureSampleLevel(
    blurredAlphaTex,
    samp,
    uv,
    0.0,
  ).r;

  let noiseBase = vec3f(
    rotatedUv.x / noiseScale + phaseX,
    rotatedUv.y / noiseScale / stretchY,
    0.37 + evolutionZ,
  );

  let eps = 0.005 / noiseScale;
  let nx = fbm3(noiseBase + vec3f(eps, 0.0, 0.0)) -
    fbm3(noiseBase - vec3f(eps, 0.0, 0.0));
  let ny = fbm3(noiseBase + vec3f(0.0, eps, 0.0)) -
    fbm3(noiseBase - vec3f(0.0, eps, 0.0));

  let heightCenter =
    mix(0.5, fbm3(noiseBase) * edgeMask, heightIntensity) +
    (nx + ny) * 0.5 * heightIntensity * 0.3;

  let normalDir = normalize(vec2f(nx, ny) + vec2f(1e-6));
  let uvShift = normalDir * chromaSeparation;

  let roughAmount = max(0.0, u.roughness / 100.0);
  var roughDelta = 0.0;
  if (roughAmount > 0.0) {
    let roughFrequency = 1000.0;
    let roughPosition = vec3f(
      rotatedUv.x * roughFrequency,
      rotatedUv.y * roughFrequency,
      0.37 * roughFrequency,
    );
    let roughNoise = smoothNoise3T(
      roughPosition,
      TILE_PERIOD * roughFrequency,
    );
    roughDelta =
      (roughNoise * 2.0 - 1.0) * roughAmount * 0.05 * edgeMask;
  }

  let hR = clamp(
    heightAt(
      noiseBase + vec3f(uvShift, 0.0),
      heightIntensity,
      edgeMask,
      eps,
    ) + roughDelta,
    0.0,
    1.0,
  );
  let hG = clamp(heightCenter + roughDelta, 0.0, 1.0);
  let hB = clamp(
    heightAt(
      noiseBase - vec3f(uvShift, 0.0),
      heightIntensity,
      edgeMask,
      eps,
    ) + roughDelta,
    0.0,
    1.0,
  );

  let aaSpread = 1.0;
  let numSamples = 4u;
  let gradientRepeats = max(1.0, floor(u.gradientRepeats + 0.5));
  let dhR = fwidth(hR) * aaSpread * gradientRepeats;
  let dhG = fwidth(hG) * aaSpread * gradientRepeats;
  let dhB = fwidth(hB) * aaSpread * gradientRepeats;
  var accumulatedR = vec4f(0.0);
  var accumulatedG = vec4f(0.0);
  var accumulatedB = vec4f(0.0);
  for (var sampleIndex = 0u; sampleIndex < 16u; sampleIndex++) {
    if (sampleIndex >= numSamples) {
      break;
    }
    let jitter =
      (f32(sampleIndex) + 0.5) / f32(numSamples) - 0.5;
    accumulatedR += aaGradientLookup(
      hR * gradientRepeats + jitter * dhR,
      gradientOffset,
    );
    accumulatedG += aaGradientLookup(
      hG * gradientRepeats + jitter * dhG,
      gradientOffset,
    );
    accumulatedB += aaGradientLookup(
      hB * gradientRepeats + jitter * dhB,
      gradientOffset,
    );
  }
  let inverseSamples = 1.0 / f32(numSamples);
  let colorR = accumulatedR * inverseSamples;
  let colorG = accumulatedG * inverseSamples;
  let colorB = accumulatedB * inverseSamples;

  let chromeColor = vec4f(colorR.r, colorG.g, colorB.b, inputColor.a);
  let maskThreshold = 0.5;
  let softAlpha = smoothstep(
    maskThreshold - 0.05,
    maskThreshold + 0.05,
    edgeMask,
  );
  return vec4f(chromeColor.rgb * softAlpha, softAlpha);
}
`;
    frame.state.vertexModule = device.createShaderModule({ code: vertexWGSL });
    frame.state.blurModule = device.createShaderModule({ code: blurWGSL });
    frame.state.mainModule = device.createShaderModule({ code: mainWGSL });
    frame.state.vertexBuffers = [{
            arrayStride: 16,
            attributes: [
                { shaderLocation: 0, format: "float32x2", offset: 0 },
                { shaderLocation: 1, format: "float32x2", offset: 8 },
            ],
        }];
    frame.state.hPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: frame.state.vertexModule,
            entryPoint: "vs_main",
            buffers: frame.state.vertexBuffers,
        },
        fragment: {
            module: frame.state.blurModule,
            entryPoint: "h_fs",
            targets: [{ format: "rgba8unorm" }],
        },
        primitive: { topology: "triangle-list" },
    });
    frame.state.vPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: frame.state.vertexModule,
            entryPoint: "vs_main",
            buffers: frame.state.vertexBuffers,
        },
        fragment: {
            module: frame.state.blurModule,
            entryPoint: "v_fs",
            targets: [{ format: "rgba8unorm" }],
        },
        primitive: { topology: "triangle-list" },
    });
    frame.state.mainPipeline = null;
    frame.state.mainPipelineFormat = null;
    frame.state.quad = device.createBuffer({
        size: 6 * 4 * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(frame.state.quad.getMappedRange()).set([
        -1, -1, 0, 1,
        1, -1, 1, 1,
        -1, 1, 0, 0,
        -1, 1, 0, 0,
        1, -1, 1, 1,
        1, 1, 1, 0,
    ]);
    frame.state.quad.unmap();
    frame.state.blurUniformBuf = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    frame.state.blurUniformData = new Float32Array(4);
    frame.state.lastBlurUniformData = new Float32Array(4);
    frame.state.lastBlurUniformData.fill(Number.NaN);
    // Main uniform buffer: 208 bytes (52 floats).
    frame.state.mainUniformBuf = device.createBuffer({
        size: 208,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    frame.state.mainUniformData = new Float32Array(52);
    frame.state.lastMainUniformData = new Float32Array(52);
    frame.state.lastMainUniformData.fill(Number.NaN);
    frame.state.sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
    });
    frame.state.placeholder = device.createTexture({
        size: [1, 1, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: frame.state.placeholder }, new Uint8Array([0, 0, 0, 0]), { bytesPerRow: 4 }, { width: 1, height: 1, depthOrArrayLayers: 1 });
    frame.state.placeholderView = frame.state.placeholder.createView();
    frame.state.defaultGradient = [
        { position: 0.18, color: { r: 1.0, g: 1.0, b: 1.0, a: 1 } },
        { position: 0.43, color: { r: 0.278, g: 0.302, b: 0.329, a: 1 } },
        { position: 0.43, color: { r: 1.0, g: 1.0, b: 1.0, a: 1 } },
        { position: 0.55, color: { r: 1.0, g: 1.0, b: 1.0, a: 1 } },
        { position: 0.55, color: { r: 0.247, g: 0.247, b: 0.251, a: 1 } },
        { position: 0.70, color: { r: 0.247, g: 0.247, b: 0.251, a: 1 } },
        { position: 0.70, color: { r: 1.0, g: 1.0, b: 1.0, a: 1 } },
    ];
    frame.state.intermediate1 = null;
    frame.state.intermediate2 = null;
    frame.state.intermediate1View = null;
    frame.state.intermediate2View = null;
    frame.state.intermediateW = 0;
    frame.state.intermediateH = 0;
    frame.state.inputTexture = frame.state.placeholder;
    frame.state.inputView = frame.state.placeholderView;
    frame.state.outputTexture = null;
    frame.state.outputView = null;
    frame.state.hBindGroup = null;
    frame.state.vBindGroup = null;
    frame.state.mainBindGroup = null;
}
export function render(device, frame) {
    const params = frame.params || {};
    const output = frame.output || {};
    const width = Math.max(1, finiteNumber(output.physicalWidth ?? output.width, 1));
    const height = Math.max(1, finiteNumber(output.physicalHeight ?? output.height, 1));
    if (frame.state.intermediate1 == null ||
        frame.state.intermediateW !== width ||
        frame.state.intermediateH !== height) {
        if (frame.state.intermediate1 != null) {
            frame.state.intermediate1.destroy();
        }
        if (frame.state.intermediate2 != null) {
            frame.state.intermediate2.destroy();
        }
        frame.state.intermediate1 = device.createTexture({
            size: [width, height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        });
        frame.state.intermediate2 = device.createTexture({
            size: [width, height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        });
        frame.state.intermediate1View = frame.state.intermediate1.createView();
        frame.state.intermediate2View = frame.state.intermediate2.createView();
        frame.state.intermediateW = width;
        frame.state.intermediateH = height;
        frame.state.vBindGroup = null;
        frame.state.mainBindGroup = null;
    }
    const outputFormat = frame.output.format;
    if (frame.state.mainPipeline == null ||
        frame.state.mainPipelineFormat !== outputFormat) {
        frame.state.mainPipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: frame.state.vertexModule,
                entryPoint: "vs_main",
                buffers: frame.state.vertexBuffers,
            },
            fragment: {
                module: frame.state.mainModule,
                entryPoint: "fs_main",
                targets: [{ format: outputFormat }],
            },
            primitive: { topology: "triangle-list" },
        });
        frame.state.mainPipelineFormat = outputFormat;
        frame.state.mainBindGroup = null;
    }
    const inputTexture = frame.input != null
        ? frame.input
        : frame.state.placeholder;
    if (frame.state.inputTexture !== inputTexture) {
        frame.state.inputTexture = inputTexture;
        frame.state.inputView = inputTexture === frame.state.placeholder
            ? frame.state.placeholderView
            : inputTexture.createView();
        frame.state.hBindGroup = null;
        frame.state.mainBindGroup = null;
    }
    if (frame.state.outputTexture !== frame.output) {
        frame.state.outputTexture = frame.output;
        frame.state.outputView = frame.output.createView();
    }
    const blurSigma = numberParam(params, "blurStrength", 7.5);
    const blurUniformData = frame.state.blurUniformData;
    blurUniformData[0] = blurSigma;
    blurUniformData[1] = frame.renderScale / width;
    blurUniformData[2] = frame.renderScale / height;
    blurUniformData[3] = 0;
    writeBufferIfChanged(device, frame.state.blurUniformBuf, blurUniformData, frame.state.lastBlurUniformData);
    const mainUniformData = frame.state.mainUniformData;
    writeGradientParam(mainUniformData, params, "chromeGradient", frame.state.defaultGradient);
    mainUniformData[41] = numberParam(params, "heightIntensity", 100);
    mainUniformData[42] = numberParam(params, "chromaSepR", 10);
    mainUniformData[43] = numberParam(params, "noiseScale", 50);
    mainUniformData[44] = numberParam(params, "phase", 0);
    mainUniformData[45] = numberParam(params, "evolution", 0);
    mainUniformData[46] = numberParam(params, "noiseAngle", 30);
    mainUniformData[47] = numberParam(params, "stretch", 200);
    mainUniformData[48] = numberParam(params, "gradientOffset", 0);
    mainUniformData[49] = numberParam(params, "gradientRepeats", 2);
    mainUniformData[50] = numberParam(params, "roughness", 0);
    mainUniformData[51] = 0;
    writeBufferIfChanged(device, frame.state.mainUniformBuf, mainUniformData, frame.state.lastMainUniformData);
    if (frame.state.hBindGroup == null) {
        frame.state.hBindGroup = device.createBindGroup({
            layout: frame.state.hPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: frame.state.blurUniformBuf } },
                { binding: 1, resource: frame.state.sampler },
                { binding: 2, resource: frame.state.inputView },
            ],
        });
    }
    if (frame.state.vBindGroup == null) {
        frame.state.vBindGroup = device.createBindGroup({
            layout: frame.state.vPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: frame.state.blurUniformBuf } },
                { binding: 1, resource: frame.state.sampler },
                { binding: 2, resource: frame.state.intermediate1View },
            ],
        });
    }
    if (frame.state.mainBindGroup == null) {
        frame.state.mainBindGroup = device.createBindGroup({
            layout: frame.state.mainPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: frame.state.mainUniformBuf } },
                { binding: 1, resource: frame.state.sampler },
                { binding: 2, resource: frame.state.inputView },
                { binding: 3, resource: frame.state.intermediate2View },
            ],
        });
    }
    const encoder = device.createCommandEncoder();
    const horizontalPass = encoder.beginRenderPass({
        colorAttachments: [{
                view: frame.state.intermediate1View,
                loadOp: "clear",
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: "store",
            }],
    });
    horizontalPass.setPipeline(frame.state.hPipeline);
    horizontalPass.setBindGroup(0, frame.state.hBindGroup);
    horizontalPass.setVertexBuffer(0, frame.state.quad);
    horizontalPass.draw(6);
    horizontalPass.end();
    const verticalPass = encoder.beginRenderPass({
        colorAttachments: [{
                view: frame.state.intermediate2View,
                loadOp: "clear",
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: "store",
            }],
    });
    verticalPass.setPipeline(frame.state.vPipeline);
    verticalPass.setBindGroup(0, frame.state.vBindGroup);
    verticalPass.setVertexBuffer(0, frame.state.quad);
    verticalPass.draw(6);
    verticalPass.end();
    const mainPass = encoder.beginRenderPass({
        colorAttachments: [{
                view: frame.state.outputView,
                loadOp: "clear",
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: "store",
            }],
    });
    mainPass.setPipeline(frame.state.mainPipeline);
    mainPass.setBindGroup(0, frame.state.mainBindGroup);
    mainPass.setVertexBuffer(0, frame.state.quad);
    mainPass.draw(6);
    mainPass.end();
    device.queue.submit([encoder.finish()]);
}
defineProperties(Effect, {
    "blurStrength": {
        type: "number", label: "Rounding",
        defaultValue: 7.5, control: "slider", min: 0, max: 10, step: 0.5,
    },
    "heightIntensity": {
        type: "number", label: "Depth",
        defaultValue: 100, control: "slider", min: 0, max: 200, step: 1,
        unit: "%",
    },
    "roughness": {
        type: "number", label: "Roughness",
        defaultValue: 0, control: "slider", min: 0, max: 100, step: 1,
        unit: "%",
    },
    "chromaSepR": {
        type: "number", label: "RGB split",
        defaultValue: 10, control: "slider", min: 0, max: 100, step: 1,
        unit: "%",
    },
    "noiseScale": {
        type: "number", label: "Scale",
        defaultValue: 50, control: "slider", min: 2, max: 200, step: 1,
        unit: "%",
    },
    "stretch": {
        type: "number", label: "Stretch",
        defaultValue: 200, control: "slider", min: 0, max: 500, step: 1,
        unit: "%",
    },
    "noiseAngle": {
        type: "number", label: "Angle",
        defaultValue: 30, control: "slider", min: -180, max: 180, step: 1,
    },
    "chromeGradient": {
        type: "gradient", label: "Gradient",
        defaultValue: { "stops": [
                { "position": 0.18, "color": { "r": 1.0, "g": 1.0, "b": 1.0, "a": 1 } },
                { "position": 0.43, "color": { "r": 0.278, "g": 0.302, "b": 0.329, "a": 1 } },
                { "position": 0.43, "color": { "r": 1.0, "g": 1.0, "b": 1.0, "a": 1 } },
                { "position": 0.55, "color": { "r": 1.0, "g": 1.0, "b": 1.0, "a": 1 } },
                { "position": 0.55, "color": { "r": 0.247, "g": 0.247, "b": 0.251, "a": 1 } },
                { "position": 0.70, "color": { "r": 0.247, "g": 0.247, "b": 0.251, "a": 1 } },
                { "position": 0.70, "color": { "r": 1.0, "g": 1.0, "b": 1.0, "a": 1 } },
            ] },
    },
    "gradientRepeats": {
        type: "number", label: "Repeats",
        defaultValue: 2, control: "slider", min: 1, max: 10, step: 1,
    },
    "gradientOffset": {
        type: "number", label: "Offset",
        defaultValue: 0, control: "slider", min: -100, max: 100, step: 1,
        unit: "%",
    },
    "phase": {
        type: "number", label: "Phase",
        defaultValue: 0, control: "slider", min: -100, max: 100, step: 1,
        unit: "%",
    },
    "evolution": {
        type: "number", label: "Evolution",
        defaultValue: 0, control: "slider", min: -100, max: 100, step: 1,
        unit: "%",
    },
});

export const manifest = {
  "name": "Chromatic metal",
  "version": 3,
  "isAnimated": false,
  "usesMouse": false,
  "renderScaleAware": true
}
