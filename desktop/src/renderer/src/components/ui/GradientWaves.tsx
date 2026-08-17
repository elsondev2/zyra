import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import './GradientWaves.css'

type GradientWavesDetail = 'low' | 'medium' | 'high'

export type GradientWavesProps = {
    horizonColor?: string
    waveColor?: string
    crestColor?: string
    speed?: number
    amplitude?: number
    waveScale?: number
    waveRatio?: number
    swell?: number
    turbulence?: number
    tilt?: number
    zoom?: number
    height?: number
    fogDepth?: number
    detail?: GradientWavesDetail
    brightness?: number
    opacity?: number
    mouseInteraction?: boolean
    parallaxStrength?: number
    grain?: boolean
    grainIntensity?: number
    maxFps?: number
    className?: string
}

type Uniform<T> = { value: T }
type GradientWavesUniforms = {
    iTime: Uniform<number>
    iResolution: Uniform<Float32Array>
    uSpeed: Uniform<number>
    uAmplitude: Uniform<number>
    uWaveScale: Uniform<number>
    uWaveRatio: Uniform<number>
    uSwell: Uniform<number>
    uTurbulence: Uniform<number>
    uTilt: Uniform<number>
    uZoom: Uniform<number>
    uHeight: Uniform<number>
    uFogDepth: Uniform<number>
    uSteps: Uniform<number>
    uBrightness: Uniform<number>
    uOpacity: Uniform<number>
    uGrain: Uniform<number>
    uGrainIntensity: Uniform<number>
    uMouse: Uniform<Float32Array>
    uParallax: Uniform<number>
    uEnableMouse: Uniform<boolean>
    uHorizonColor: Uniform<Float32Array>
    uWaveColor: Uniform<Float32Array>
    uCrestColor: Uniform<Float32Array>
}

type GradientWavesContext = {
    uniforms: GradientWavesUniforms
    syncAnimation: () => void
}

const ctxMap = new WeakMap<HTMLDivElement, GradientWavesContext>()

function parseHexColor(value: string): [number, number, number] | null {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value.trim())
    if (!match) return null
    return [
        Number.parseInt(match[1], 16) / 255,
        Number.parseInt(match[2], 16) / 255,
        Number.parseInt(match[3], 16) / 255
    ]
}

function resolveColor(value: string, container: HTMLElement): [number, number, number] {
    const hex = parseHexColor(value)
    if (hex) return hex

    const probe = document.createElement('span')
    probe.style.color = value
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    container.appendChild(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()

    const match = resolved.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
    if (!match) return [1, 1, 1]
    return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255]
}

function detailToSteps(detail: GradientWavesDetail): number {
    if (detail === 'low') return 40
    if (detail === 'high') return 110
    return 70
}

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform bool uEnableMouse;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;

const float MAX_DIST = 20000.0;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float plasma(vec3 r, vec2 freq, vec4 tc) {
  float mx = r.x + tc.x;
  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);
  float my = r.y - tc.z;
  my += uTurbulence * cos(r.x / 23.0 + tc.w);
  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);
}

float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float dscene = plasma(pos + dist * dir, freq, tc);
    if (abs(dscene) < 0.1) break;
    dist += 0.9 * dscene;
    if (!(abs(dist) < MAX_DIST)) return MAX_DIST;
  }
  return dist;
}

void main() {
  float T = iTime * uSpeed;
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);
  float c, s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;
  uv.x *= iResolution.x / iResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot); s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  c = nuv.x; s = nuv.y;
  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt); s = sin(uTilt);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;

  if (uEnableMouse) {
    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
    c = cos(yaw); s = sin(yaw);
    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
    c = cos(pitch); s = sin(pitch);
    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  }

  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;

  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));
  vec3 col = mix(uHorizonColor, body, t);
  col *= uBrightness;
  col = clamp(col, 0.0, 1.0);

  float alpha = clamp(t, 0.0, 1.0) * uOpacity;
  if (uGrain > 0.5) {
    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
    alpha += (g - 0.5) * uGrainIntensity;
  }
  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`

export default function GradientWaves({
    horizonColor = '#5227FF',
    waveColor = '#FF9FFC',
    crestColor = '#FFFFFF',
    speed = 0.4,
    amplitude = 2.5,
    waveScale = 0.6,
    waveRatio = 0.9,
    swell = 35,
    turbulence = 20,
    tilt = 1.11,
    zoom = 1,
    height = 5.5,
    fogDepth = 15,
    detail = 'medium',
    brightness = 1,
    opacity = 1,
    mouseInteraction = true,
    parallaxStrength = 0.5,
    grain = true,
    grainIntensity = 0.05,
    maxFps = 60,
    className = ''
}: GradientWavesProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const enableMouseRef = useRef(mouseInteraction)
    const maxFpsRef = useRef(maxFps)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        let renderer: Renderer
        try {
            renderer = new Renderer({
                webgl: 2,
                alpha: true,
                premultipliedAlpha: true,
                antialias: false,
                powerPreference: 'low-power',
                dpr: Math.min(window.devicePixelRatio || 1, 1)
            })
        } catch (error) {
            console.warn('[GradientWaves] WebGL 2 is unavailable.', error)
            return
        }

        const gl = renderer.gl
        gl.clearColor(0, 0, 0, 0)
        const canvas = gl.canvas
        canvas.setAttribute('aria-hidden', 'true')
        container.appendChild(canvas)

        const geometry = new Triangle(gl)
        const uniforms: GradientWavesUniforms = {
            iTime: { value: 0 },
            iResolution: { value: new Float32Array([1, 1]) },
            uSpeed: { value: speed },
            uAmplitude: { value: amplitude },
            uWaveScale: { value: waveScale },
            uWaveRatio: { value: waveRatio },
            uSwell: { value: swell },
            uTurbulence: { value: turbulence },
            uTilt: { value: tilt },
            uZoom: { value: zoom },
            uHeight: { value: height },
            uFogDepth: { value: fogDepth },
            uSteps: { value: detailToSteps(detail) },
            uBrightness: { value: brightness },
            uOpacity: { value: opacity },
            uGrain: { value: grain ? 1 : 0 },
            uGrainIntensity: { value: grainIntensity },
            uMouse: { value: new Float32Array([0.5, 0.5]) },
            uParallax: { value: parallaxStrength },
            uEnableMouse: { value: mouseInteraction },
            uHorizonColor: { value: new Float32Array(resolveColor(horizonColor, container)) },
            uWaveColor: { value: new Float32Array(resolveColor(waveColor, container)) },
            uCrestColor: { value: new Float32Array(resolveColor(crestColor, container)) }
        }
        const program = new Program(gl, {
            vertex,
            fragment,
            uniforms,
            transparent: true,
            depthTest: false,
            depthWrite: false
        })
        const mesh = new Mesh(gl, { geometry, program })

        const renderFrame = () => renderer.render({ scene: mesh })
        const setSize = () => {
            const rect = container.getBoundingClientRect()
            renderer.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)))
            uniforms.iResolution.value[0] = gl.drawingBufferWidth
            uniforms.iResolution.value[1] = gl.drawingBufferHeight
            renderFrame()
        }
        const resizeObserver = new ResizeObserver(setSize)
        resizeObserver.observe(container)
        setSize()

        const currentMouse = [0.5, 0.5]
        const targetMouse = [0.5, 0.5]
        const onPointerMove = (event: PointerEvent) => {
            const rect = canvas.getBoundingClientRect()
            targetMouse[0] = (event.clientX - rect.left) / Math.max(rect.width, 1)
            targetMouse[1] = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1)
        }
        const onPointerLeave = () => {
            targetMouse[0] = 0.5
            targetMouse[1] = 0.5
        }
        canvas.addEventListener('pointermove', onPointerMove)
        canvas.addEventListener('pointerleave', onPointerLeave)

        const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
        let raf = 0
        let intersecting = true
        let pageVisible = !document.hidden
        const startedAt = performance.now()
        let lastRenderAt = 0
        const shouldAnimate = () => (
            !reduceMotionQuery.matches
            && !document.body.classList.contains('zyra-reduce-motion')
            && (uniforms.uSpeed.value !== 0 || uniforms.uEnableMouse.value || uniforms.uGrain.value > 0.5)
        )
        const stop = () => {
            if (raf !== 0) cancelAnimationFrame(raf)
            raf = 0
        }
        const loop = (time: number) => {
            const frameInterval = 1_000 / Math.max(1, maxFpsRef.current)
            if (time - lastRenderAt < frameInterval) {
                raf = requestAnimationFrame(loop)
                return
            }
            lastRenderAt = time
            uniforms.iTime.value = (time - startedAt) * 0.001
            const targetX = enableMouseRef.current ? targetMouse[0] : 0.5
            const targetY = enableMouseRef.current ? targetMouse[1] : 0.5
            currentMouse[0] += 0.05 * (targetX - currentMouse[0])
            currentMouse[1] += 0.05 * (targetY - currentMouse[1])
            uniforms.uMouse.value[0] = currentMouse[0]
            uniforms.uMouse.value[1] = currentMouse[1]
            renderFrame()
            raf = requestAnimationFrame(loop)
        }
        const syncAnimation = () => {
            stop()
            if (intersecting && pageVisible && shouldAnimate()) raf = requestAnimationFrame(loop)
            else renderFrame()
        }
        ctxMap.set(container, { uniforms, syncAnimation })

        const intersectionObserver = new IntersectionObserver(([entry]) => {
            intersecting = entry.isIntersecting
            syncAnimation()
        })
        intersectionObserver.observe(container)
        const onVisibility = () => {
            pageVisible = !document.hidden
            syncAnimation()
        }
        const onMotionPreference = () => syncAnimation()
        const bodyObserver = new MutationObserver(syncAnimation)
        bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
        document.addEventListener('visibilitychange', onVisibility)
        reduceMotionQuery.addEventListener('change', onMotionPreference)
        syncAnimation()

        return () => {
            stop()
            resizeObserver.disconnect()
            intersectionObserver.disconnect()
            bodyObserver.disconnect()
            document.removeEventListener('visibilitychange', onVisibility)
            reduceMotionQuery.removeEventListener('change', onMotionPreference)
            canvas.removeEventListener('pointermove', onPointerMove)
            canvas.removeEventListener('pointerleave', onPointerLeave)
            ctxMap.delete(container)
            program.remove()
            geometry.remove()
            canvas.remove()
            gl.getExtension('WEBGL_lose_context')?.loseContext()
        }
        // Renderer and GPU resources are intentionally created once per mounted background.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const ctx = ctxMap.get(container)
        if (!ctx) return
        const { uniforms } = ctx

        enableMouseRef.current = mouseInteraction
        maxFpsRef.current = maxFps
        uniforms.uSpeed.value = speed
        uniforms.uAmplitude.value = amplitude
        uniforms.uWaveScale.value = waveScale
        uniforms.uWaveRatio.value = waveRatio
        uniforms.uSwell.value = swell
        uniforms.uTurbulence.value = turbulence
        uniforms.uTilt.value = tilt
        uniforms.uZoom.value = zoom
        uniforms.uHeight.value = height
        uniforms.uFogDepth.value = fogDepth
        uniforms.uSteps.value = detailToSteps(detail)
        uniforms.uBrightness.value = brightness
        uniforms.uOpacity.value = opacity
        uniforms.uGrain.value = grain ? 1 : 0
        uniforms.uGrainIntensity.value = grainIntensity
        uniforms.uParallax.value = parallaxStrength
        uniforms.uEnableMouse.value = mouseInteraction
        uniforms.uHorizonColor.value.set(resolveColor(horizonColor, container))
        uniforms.uWaveColor.value.set(resolveColor(waveColor, container))
        uniforms.uCrestColor.value.set(resolveColor(crestColor, container))
        ctx.syncAnimation()
    }, [
        amplitude,
        brightness,
        crestColor,
        detail,
        fogDepth,
        grain,
        grainIntensity,
        height,
        horizonColor,
        maxFps,
        mouseInteraction,
        opacity,
        parallaxStrength,
        speed,
        swell,
        tilt,
        turbulence,
        waveColor,
        waveRatio,
        waveScale,
        zoom
    ])

    return <div ref={containerRef} className={`gradient-waves-container ${className}`.trim()} />
}
