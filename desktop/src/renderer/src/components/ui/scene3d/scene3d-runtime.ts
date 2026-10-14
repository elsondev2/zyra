import { Box, Camera, Color, Cylinder, Geometry, GridHelper, Mesh, Program, Raycast, Renderer, Sphere, Torus, Transform, Vec3 } from 'ogl'
import type { Scene3D, Scene3DObject } from '@shared/visualization-resources'

import type { OGLRenderingContext } from 'ogl'

export type SceneNode = Scene3DObject
type V3 = [number, number, number]

const vec = (v: V3 | undefined, fallback: V3): V3 => v ?? fallback
const parseColor = (value: string | undefined): [number, number, number] => {
    const hex = value ?? '#8ba8ff'
    const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex)
    if (!match) return [0.55, 0.66, 1]
    const raw = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1]
    return [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16) / 255) as [number, number, number]
}

function pyramidGeometry(gl: OGLRenderingContext) {
    const faces: number[][] = [
        [-.5, 0, -.5, .5, 0, -.5, 0, 1, 0], [.5, 0, -.5, .5, 0, .5, 0, 1, 0],
        [.5, 0, .5, -.5, 0, .5, 0, 1, 0], [-.5, 0, .5, -.5, 0, -.5, 0, 1, 0],
        [-.5, 0, -.5, -.5, 0, .5, .5, 0, .5], [-.5, 0, -.5, .5, 0, .5, .5, 0, -.5],
    ]
    const positions: number[] = [], normals: number[] = []
    for (let i = 0; i < faces.length; i++) {
        const f = faces[i]
        for (let j = 0; j < 9; j += 3) positions.push(f[j], f[j + 1], f[j + 2])
        const a = new Vec3(f[3] - f[0], f[4] - f[1], f[5] - f[2])
        const b = new Vec3(f[6] - f[0], f[7] - f[1], f[8] - f[2])
        const n = new Vec3().cross(a, b).normalize()
        for (let j = 0; j < 3; j++) normals.push(n[0], n[1], n[2])
    }
    return new Geometry(gl, { position: { size: 3, data: new Float32Array(positions) }, normal: { size: 3, data: new Float32Array(normals) } })
}

export type CameraView = { yaw: number; pitch: number; distance: number; panX: number; panY: number; target: V3 }
export type Viewer = { draw: () => void; resize: () => void; dispose: () => void; setView: (view: CameraView) => void; select: (x: number, y: number) => SceneNode | undefined }

export function createSceneViewer(canvas: HTMLCanvasElement, scene: Scene3D, onContextLost: () => void): Viewer {
    let renderer: Renderer
    try {
        renderer = new Renderer({ canvas, alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 2) })
    } catch {
        throw new Error('3D graphics are unavailable. You can still inspect the saved scene code.')
    }
    const gl = renderer.gl
    const camera = new Camera(gl, { fov: 42, near: 0.01, far: 500000 })
    const initialPosition = vec(scene.camera?.position, [4, 3, 6])
    const target = vec(scene.camera?.target, [0, 0, 0])
    const initialDistance = Math.hypot(initialPosition[0] - target[0], initialPosition[1] - target[1], initialPosition[2] - target[2]) || 8
    const view: CameraView = { yaw: Math.atan2(initialPosition[0] - target[0], initialPosition[2] - target[2]), pitch: Math.asin((initialPosition[1] - target[1]) / initialDistance), distance: initialDistance, panX: 0, panY: 0, target }
    const viewTarget = new Vec3(...target)
    const updateView = () => {
        viewTarget.set(view.target[0] + view.panX, view.target[1] + view.panY, view.target[2])
        const horizontal = Math.cos(view.pitch) * view.distance
        camera.position.set(viewTarget[0] + Math.sin(view.yaw) * horizontal, viewTarget[1] + Math.sin(view.pitch) * view.distance, viewTarget[2] + Math.cos(view.yaw) * horizontal)
        camera.lookAt(viewTarget)
    }
    updateView()
    const root = new Transform()
    const transforms = new Map<string, Transform>()
    for (const item of scene.objects) {
        const transform = new Transform()
        transform.position.set(...vec(item.position, [0, 0, 0]))
        transform.rotation.set(...vec(item.rotation, [0, 0, 0]))
        transform.scale.set(...vec(item.scale, [1, 1, 1]))
        transforms.set(item.id, transform)
    }
    for (const item of scene.objects) {
        const transform = transforms.get(item.id)
        const parent = item.parentId ? transforms.get(item.parentId) : undefined
        if (transform) (parent ?? root).addChild(transform)
    }
    const meshes: { node: SceneNode; mesh: Mesh }[] = []
    const programByColor = new Map<string, Program>()
    const createProgram = (node: SceneNode) => {
        const color = node.color ?? '#8ba8ff'
        const opacity = node.opacity ?? 1
        const programKey = `${color}:${opacity}`
        let program = programByColor.get(programKey)
        if (!program) {
            program = new Program(gl, {
                vertex: `attribute vec3 position; attribute vec3 normal; uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; uniform mat4 modelMatrix; varying vec3 vNormal; void main(){vNormal=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
                fragment: `precision mediump float; uniform vec3 uColor; uniform float uOpacity; varying vec3 vNormal; void main(){float light=.35+.65*max(dot(normalize(vNormal),normalize(vec3(-.4,.8,.55))),0.0);gl_FragColor=vec4(uColor*light,uOpacity);}`,
                uniforms: { uColor: { value: parseColor(color) }, uOpacity: { value: opacity } },
                transparent: opacity < 1,
                cullFace: false,
            })
            programByColor.set(programKey, program)
        }
        return program
    }
    const geometries = new Map<string, Geometry>()
    for (const item of scene.objects) {
        const transform = transforms.get(item.id)
        if (!transform || item.type === 'group') continue
        const geometryKey = item.type === 'cylinder' || item.type === 'torus' ? `${item.type}:${item.radius ?? ''}:${item.height ?? ''}` : item.type
        let geometry = geometries.get(geometryKey)
        if (!geometry) {
            switch (item.type) {
                case 'box': geometry = new Box(gl, { width: 1, height: 1, depth: 1 }); break
                case 'sphere': geometry = new Sphere(gl, { radius: 1, widthSegments: 24, heightSegments: 16 }); break
                case 'cylinder': geometry = new Cylinder(gl, { radiusTop: item.radius ?? 0.5, radiusBottom: item.radius ?? 0.5, height: item.height ?? 1, radialSegments: 24 }); break
                case 'torus': geometry = new Torus(gl, { radius: item.radius ?? 0.65, tube: 0.2, radialSegments: 32, tubularSegments: 12 }); break
                case 'pyramid': geometry = pyramidGeometry(gl); break
            }
            if (geometry) geometries.set(geometryKey, geometry)
        }
        if (!geometry) continue
        const mesh = new Mesh(gl, { geometry, program: createProgram(item) })
        if (item.type === 'box') mesh.scale.set(...vec(item.size, [1, 1, 1]))
        else if (item.type === 'sphere') { const radius = item.radius ?? 0.5; mesh.scale.set(radius, radius, radius) }
        else if (item.type === 'pyramid') mesh.scale.set(...vec(item.size, [1, 1, 1]))
        transform.addChild(mesh)
        meshes.push({ node: item, mesh })
    }
    const grid = scene.grid ? new GridHelper(gl, { size: 10, divisions: 10, color: new Color(0.23, 0.27, 0.34) }) : undefined
    if (grid) root.addChild(grid)
    const resize = () => {
        const rect = (canvas.parentElement || canvas).getBoundingClientRect()
        if (!rect.width || !rect.height) return
        renderer.setSize(rect.width, rect.height)
        // OGL owns the backing resolution, CSS owns the responsive canvas.
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        camera.perspective({ aspect: rect.width / rect.height })
    }
    const draw = () => {
        if (scene.background) {
            const color = parseColor(scene.background)
            gl.clearColor(color[0], color[1], color[2], 1)
        } else gl.clearColor(0, 0, 0, 0)
        renderer.render({ scene: root, camera })
    }
    const lost = (event: Event) => { event.preventDefault(); onContextLost() }
    canvas.addEventListener('webglcontextlost', lost)
    resize()
    draw()
    const raycaster = new Raycast()
    const raycast = (x: number, y: number) => {
        const rect = canvas.getBoundingClientRect()
        if (!rect.width || !rect.height) return undefined
        renderer.render({ scene: root, camera })
        raycaster.castMouse(camera, [((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1])
        const hits = raycaster.intersectMeshes(meshes.map(entry => entry.mesh), { cullFace: false, includeUV: false, includeNormal: false })
        return meshes.find(entry => entry.mesh === hits[0])?.node
    }
    return {
        draw, resize,
        setView: next => { Object.assign(view, next); updateView() },
        select: raycast,
        dispose: () => {
            canvas.removeEventListener('webglcontextlost', lost)
            for (const geometry of geometries.values()) geometry.remove()
            for (const program of programByColor.values()) program.remove()
            if (grid) { grid.geometry.remove(); grid.program.remove() }
            const lose = gl.getExtension('WEBGL_lose_context')
            lose?.loseContext()
        },
    }
}
