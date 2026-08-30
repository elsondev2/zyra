import { Renderer, Program, Mesh, Color, Triangle, RenderTarget } from 'ogl'
import { useEffect, useRef, type CSSProperties } from 'react'
import { rendererVisibility, shouldSnapRendererPresentation } from '@/lib/renderer-visibility'

import './Strands.css'

const MAX_STRANDS = 12
const MAX_COLORS = 8

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform int uStrandCount;
uniform float uAmplitude;
uniform float uWaviness;
uniform float uThickness;
uniform float uGlow;
uniform float uTaper;
uniform float uSpread;
uniform float uHueShift;
uniform float uIntensity;
uniform float uOpacity;
uniform float uScale;
uniform float uSaturation;

out vec4 fragColor;

const float PI = 3.14159265;

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.00, 0.33, 0.67)));
}

vec3 samplePalette(float t) {
  t = fract(t);
  float scaled = t * float(uColorCount);
  int idx = int(floor(scaled));
  float blend = fract(scaled);
  int nextIdx = idx + 1;
  if (nextIdx >= uColorCount) nextIdx = 0;
  return mix(uColors[idx], uColors[nextIdx], blend);
}

vec3 strandColor(float t) {
  if (uColorCount > 0) return samplePalette(t);
  return spectrum(t);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  uv /= max(uScale, 0.0001);

  float e = 0.06 + uIntensity * 0.94;
  float env = pow(max(cos(uv.x * PI * 1.3), 0.0), uTaper);

  vec3 col = vec3(0.0);

  for (int i = 0; i < ${MAX_STRANDS}; i++) {
    if (i >= uStrandCount) break;

    float fi = float(i);
    float ph = fi * 1.7 * uSpread;
    float freq = (2.0 + fi * 0.35) * uWaviness;
    float spd = 1.4 + fi * 1.2;

    float tt = uTime;
    float w = sin(uv.x * freq + tt * spd + ph) * 0.60
            + sin(uv.x * freq * 1.1 - tt * spd * 0.7 + ph * 1.7) * 0.40;

    float amp = (0.1 + 0.02 * e) * env * uAmplitude;
    float y = w * amp;

    float d = abs(uv.y - y);
    float thick = (0.001 + 0.05 * e) * (0.35 + env) * uThickness;
    float g = thick / (d + thick * 0.45);
    g = g * g;

    float h = fi / float(uStrandCount) + uv.x * 0.30 + uTime * 0.04 + uHueShift;
    col += strandColor(h) * g * env;
  }

  col *= 0.45 + 0.7 * e;
  col = 1.0 - exp(-col * uGlow);

  float gray = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(gray), col, uSaturation), 0.0);

  float lum = max(max(col.r, col.g), col.b);
  float alpha = clamp(lum, 0.0, 1.0) * uOpacity;

  fragColor = vec4(col * uOpacity, alpha);
}
`

const GLASS_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uRefraction;
uniform float uDispersion;

out vec4 fragColor;

vec2 toUv(vec2 p) {
  return p * (uResolution.y / uResolution) + 0.5;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float d = length(p);
  float r = uRadius;

  float edge = fwidth(d) * 1.5;
  float mask = 1.0 - smoothstep(r - edge, r + edge, d);
  if (mask <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 dir = d > 0.0 ? p / d : vec2(0.0);
  float z = sqrt(max(r * r - d * d, 0.0)) / r;
  float nd = d / r;
  float lens = smoothstep(0.85, 1.0, nd) * pow(nd, 6.0);
  vec2 offset = -dir * lens * uRefraction * 0.15;
  vec2 disp = -dir * lens * uDispersion * 0.012;

  vec3 light;
  light.r = texture(uScene, toUv(p + offset - disp)).r;
  light.g = texture(uScene, toUv(p + offset)).g;
  light.b = texture(uScene, toUv(p + offset + disp)).b;

  float fres = pow(1.0 - z, 3.0);
  vec3 rim = vec3(1.0) * fres * 0.18;

  vec2 lightDir = normalize(vec2(-0.55, 0.6));
  float spec = pow(max(dot(p / max(r, 1e-4), lightDir), 0.0), 6.0);
  spec *= smoothstep(r, r * 0.55, d);

  vec3 emissive = light + rim + vec3(spec) * 0.4;
  float emissiveA = clamp(max(max(emissive.r, emissive.g), emissive.b), 0.0, 1.0);
  float bodyA = 0.05 + fres * 0.05;
  float outA = emissiveA + bodyA * (1.0 - emissiveA);
  vec3 outRGB = emissive;

  outRGB *= mask;
  outA *= mask;

  fragColor = vec4(outRGB, outA);
}
`

interface StrandsRuntimeProps {
    colors: string[]
    count: number
    speed: number
    amplitude: number
    waviness: number
    thickness: number
    glow: number
    taper: number
    spread: number
    hueShift: number
    intensity: number
    saturation: number
    opacity: number
    scale: number
    glass: boolean
    refraction: number
    dispersion: number
    glassSize: number
    maxFps: number
}

export interface StrandsProps extends Partial<StrandsRuntimeProps> {
    className?: string
    style?: CSSProperties
}

const buildPalette = (colors: string[]): number[][] => {
    const filled = colors.length ? colors : ['#ffffff']
    const padded: number[][] = []
    for (let index = 0; index < MAX_COLORS; index += 1) {
        const hex = filled[index] ?? filled[filled.length - 1]
        const color = new Color(hex)
        padded.push([color.r, color.g, color.b])
    }
    return padded
}

export default function Strands({
    colors = ['#FF4242', '#7C3AED', '#06B6D4', '#EAB308'],
    count = 3,
    speed = 0.5,
    amplitude = 1,
    waviness = 1,
    thickness = 0.7,
    glow = 2.6,
    taper = 3,
    spread = 1,
    hueShift = 0,
    intensity = 0.6,
    saturation = 1.5,
    opacity = 1,
    scale = 1.5,
    glass = false,
    refraction = 1,
    dispersion = 1,
    glassSize = 1,
    maxFps = 60,
    className = '',
    style
}: StrandsProps) {
    const propsRef = useRef<StrandsRuntimeProps>({
        colors,
        count,
        speed,
        amplitude,
        waviness,
        thickness,
        glow,
        taper,
        spread,
        hueShift,
        intensity,
        saturation,
        opacity,
        scale,
        glass,
        refraction,
        dispersion,
        glassSize,
        maxFps
    })
    propsRef.current = {
        colors,
        count,
        speed,
        amplitude,
        waviness,
        thickness,
        glow,
        taper,
        spread,
        hueShift,
        intensity,
        saturation,
        opacity,
        scale,
        glass,
        refraction,
        dispersion,
        glassSize,
        maxFps
    }

    const containerRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const renderer = new Renderer({
            alpha: true,
            premultipliedAlpha: true,
            // The shader draws a full-screen triangle and anti-aliases its own
            // glass edge. Multisampling the offscreen pass adds cost without
            // improving the visible orb.
            antialias: false
        })
        const gl = renderer.gl
        gl.clearColor(0, 0, 0, 0)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.canvas.style.backgroundColor = 'transparent'

        const geometry = new Triangle(gl)
        if (geometry.attributes.uv) delete geometry.attributes.uv

        const initial = propsRef.current
        const program = new Program(gl, {
            vertex: VERT,
            fragment: FRAG,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: [container.offsetWidth, container.offsetHeight] },
                uColors: { value: buildPalette(initial.colors) },
                uColorCount: { value: Math.min(initial.colors.length, MAX_COLORS) },
                uStrandCount: { value: Math.min(initial.count, MAX_STRANDS) },
                uAmplitude: { value: initial.amplitude },
                uWaviness: { value: initial.waviness },
                uThickness: { value: initial.thickness },
                uGlow: { value: initial.glow },
                uTaper: { value: initial.taper },
                uSpread: { value: initial.spread },
                uHueShift: { value: initial.hueShift },
                uIntensity: { value: initial.intensity },
                uOpacity: { value: initial.opacity },
                uScale: { value: initial.scale },
                uSaturation: { value: initial.saturation }
            }
        })
        const mesh = new Mesh(gl, { geometry, program })

        const renderTarget = new RenderTarget(gl, {
            width: Math.max(1, container.offsetWidth),
            height: Math.max(1, container.offsetHeight)
        })
        const glassProgram = new Program(gl, {
            vertex: VERT,
            fragment: GLASS_FRAG,
            uniforms: {
                uScene: { value: renderTarget.texture },
                uResolution: { value: [container.offsetWidth, container.offsetHeight] },
                uRadius: { value: 0.46 * initial.glassSize },
                uRefraction: { value: initial.refraction },
                uDispersion: { value: initial.dispersion }
            }
        })
        const glassMesh = new Mesh(gl, { geometry, program: glassProgram })

        container.appendChild(gl.canvas)

        const resize = () => {
            const width = Math.max(1, container.offsetWidth)
            const height = Math.max(1, container.offsetHeight)
            renderer.setSize(width, height)
            program.uniforms.uResolution.value = [width, height]
            renderTarget.setSize(width, height)
            glassProgram.uniforms.uResolution.value = [width, height]
        }
        let resizeFrame = 0
        const scheduleResize = () => {
            window.cancelAnimationFrame(resizeFrame)
            resizeFrame = 0
            if (!rendererVisibility.getSnapshot().visible) return
            resizeFrame = window.requestAnimationFrame(() => {
                resizeFrame = 0
                resize()
            })
        }
        const resizeObserver = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(scheduleResize)
        resizeObserver?.observe(container)
        window.addEventListener('resize', scheduleResize)
        resize()

        let animationId: number | null = null
        let previousTime = 0
        let flowTime = 0
        let flowSpeed = initial.speed
        const displayedPalette = buildPalette(initial.colors)
        let targetPalette = buildPalette(initial.colors)
        let targetColorValues = [...initial.colors]
        const interpolate = (value: number, target: number, response: number) => value + (target - value) * response
        const snapPresentationToProps = (current: StrandsRuntimeProps) => {
            flowSpeed = current.speed
            targetPalette = buildPalette(current.colors)
            targetColorValues = [...current.colors]
            for (let colorIndex = 0; colorIndex < displayedPalette.length; colorIndex += 1) {
                for (let channel = 0; channel < 3; channel += 1) {
                    displayedPalette[colorIndex][channel] = targetPalette[colorIndex][channel]
                }
            }
            program.uniforms.uColors.value = displayedPalette
            program.uniforms.uColorCount.value = Math.min(current.colors.length, MAX_COLORS)
            program.uniforms.uStrandCount.value = Math.min(Math.max(Math.round(current.count), 1), MAX_STRANDS)
            program.uniforms.uAmplitude.value = current.amplitude
            program.uniforms.uWaviness.value = current.waviness
            program.uniforms.uThickness.value = current.thickness
            program.uniforms.uGlow.value = current.glow
            program.uniforms.uTaper.value = current.taper
            program.uniforms.uSpread.value = current.spread
            program.uniforms.uHueShift.value = current.hueShift
            program.uniforms.uIntensity.value = current.intensity
            program.uniforms.uOpacity.value = current.opacity
            program.uniforms.uScale.value = current.scale
            program.uniforms.uSaturation.value = current.saturation
            glassProgram.uniforms.uRefraction.value = current.refraction
            glassProgram.uniforms.uDispersion.value = current.dispersion
            glassProgram.uniforms.uRadius.value = 0.46 * current.glassSize
        }
        const update = (time: number) => {
            animationId = null
            const visibility = rendererVisibility.getSnapshot()
            if (!visibility.visible) {
                previousTime = 0
                return
            }
            const current = propsRef.current
            const frameIntervalMs = 1_000 / Math.min(60, Math.max(1, current.maxFps))
            if (previousTime > 0 && time - previousTime < frameIntervalMs - 1) {
                animationId = window.requestAnimationFrame(update)
                return
            }
            if (shouldSnapRendererPresentation(visibility, visibility.resumeRevision)) {
                snapPresentationToProps(current)
            }
            const elapsedSeconds = previousTime > 0 ? Math.min(0.1, (time - previousTime) / 1_000) : 1 / 60
            previousTime = time
            const response = 1 - Math.exp(-elapsedSeconds * 4.2)
            const colorResponse = 1 - Math.exp(-elapsedSeconds * 3.2)
            flowSpeed = interpolate(flowSpeed, current.speed, response)
            flowTime += elapsedSeconds * flowSpeed

            const paletteChanged = current.colors.length !== targetColorValues.length
                || current.colors.some((color, index) => color !== targetColorValues[index])
            if (paletteChanged) {
                targetPalette = buildPalette(current.colors)
                targetColorValues = [...current.colors]
            }
            for (let colorIndex = 0; colorIndex < displayedPalette.length; colorIndex += 1) {
                for (let channel = 0; channel < 3; channel += 1) {
                    displayedPalette[colorIndex][channel] = interpolate(
                        displayedPalette[colorIndex][channel],
                        targetPalette[colorIndex][channel],
                        colorResponse
                    )
                }
            }

            program.uniforms.uTime.value = flowTime
            program.uniforms.uColors.value = displayedPalette
            program.uniforms.uColorCount.value = Math.min(current.colors.length, MAX_COLORS)
            program.uniforms.uStrandCount.value = Math.min(Math.max(Math.round(current.count), 1), MAX_STRANDS)
            program.uniforms.uAmplitude.value = interpolate(program.uniforms.uAmplitude.value as number, current.amplitude, response)
            program.uniforms.uWaviness.value = interpolate(program.uniforms.uWaviness.value as number, current.waviness, response)
            program.uniforms.uThickness.value = interpolate(program.uniforms.uThickness.value as number, current.thickness, response)
            program.uniforms.uGlow.value = interpolate(program.uniforms.uGlow.value as number, current.glow, response)
            program.uniforms.uTaper.value = interpolate(program.uniforms.uTaper.value as number, current.taper, response)
            program.uniforms.uSpread.value = interpolate(program.uniforms.uSpread.value as number, current.spread, response)
            program.uniforms.uHueShift.value = interpolate(program.uniforms.uHueShift.value as number, current.hueShift, response)
            program.uniforms.uIntensity.value = interpolate(program.uniforms.uIntensity.value as number, current.intensity, response)
            program.uniforms.uOpacity.value = interpolate(program.uniforms.uOpacity.value as number, current.opacity, response)
            program.uniforms.uScale.value = interpolate(program.uniforms.uScale.value as number, current.scale, response)
            program.uniforms.uSaturation.value = interpolate(program.uniforms.uSaturation.value as number, current.saturation, response)

            if (current.glass) {
                renderer.render({ scene: mesh, target: renderTarget })
                glassProgram.uniforms.uScene.value = renderTarget.texture
                glassProgram.uniforms.uRefraction.value = interpolate(
                    glassProgram.uniforms.uRefraction.value as number,
                    current.refraction,
                    response
                )
                glassProgram.uniforms.uDispersion.value = interpolate(
                    glassProgram.uniforms.uDispersion.value as number,
                    current.dispersion,
                    response
                )
                glassProgram.uniforms.uRadius.value = interpolate(
                    glassProgram.uniforms.uRadius.value as number,
                    0.46 * current.glassSize,
                    response
                )
                renderer.render({ scene: glassMesh })
            } else {
                renderer.render({ scene: mesh })
            }
            animationId = window.requestAnimationFrame(update)
        }
        const reconcileVisibility = () => {
            if (!rendererVisibility.getSnapshot().visible) {
                if (animationId !== null) window.cancelAnimationFrame(animationId)
                animationId = null
                previousTime = 0
                return
            }

            window.cancelAnimationFrame(resizeFrame)
            resizeFrame = 0
            resize()
            snapPresentationToProps(propsRef.current)
            previousTime = 0
            if (animationId === null) animationId = window.requestAnimationFrame(update)
        }
        const unsubscribeVisibility = rendererVisibility.subscribe(reconcileVisibility)
        reconcileVisibility()

        return () => {
            unsubscribeVisibility()
            if (animationId !== null) window.cancelAnimationFrame(animationId)
            window.cancelAnimationFrame(resizeFrame)
            resizeObserver?.disconnect()
            window.removeEventListener('resize', scheduleResize)
            if (gl.canvas.parentNode === container) container.removeChild(gl.canvas)
            gl.getExtension('WEBGL_lose_context')?.loseContext()
        }
    }, [])

    return <div ref={containerRef} className={`strands-container ${className}`} style={style} />
}
