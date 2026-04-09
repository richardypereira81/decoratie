import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'

function Plate() {
  const group = useRef(null)

  useFrame((state, delta) => {
    if (!group.current) return
    group.current.rotation.y += delta * 0.18
    const t = state.clock.getElapsedTime()
    group.current.position.y = Math.sin(t * 0.6) * 0.04
  })

  return (
    <group ref={group} rotation={[Math.PI / 2.6, 0, 0]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.6, 0.06, 96]} />
        <meshStandardMaterial
          color="#F4EFE8"
          metalness={0.15}
          roughness={0.35}
        />
      </mesh>

      <mesh position={[0, 0.03, 0]}>
        <torusGeometry args={[1.55, 0.025, 24, 96]} />
        <meshStandardMaterial
          color="#CD805D"
          metalness={0.85}
          roughness={0.18}
          emissive="#CD805D"
          emissiveIntensity={0.06}
        />
      </mesh>

      <mesh position={[0, 0.035, 0]}>
        <cylinderGeometry args={[1.15, 1.15, 0.005, 96]} />
        <meshStandardMaterial
          color="#FFFFFF"
          metalness={0.35}
          roughness={0.2}
        />
      </mesh>

      <mesh position={[0, 0.041, 0]}>
        <torusGeometry args={[0.55, 0.008, 16, 64]} />
        <meshStandardMaterial
          color="#CD805D"
          metalness={0.9}
          roughness={0.18}
        />
      </mesh>

      <mesh position={[0, 0.043, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.003, 64]} />
        <meshStandardMaterial
          color="#55756F"
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
    </group>
  )
}

export default function Plate3D() {
  const [enhancedVisual, setEnhancedVisual] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)')
    const updatePreference = () => setEnhancedVisual(mediaQuery.matches)

    updatePreference()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference)
      return () => mediaQuery.removeEventListener('change', updatePreference)
    }

    mediaQuery.addListener(updatePreference)
    return () => mediaQuery.removeListener(updatePreference)
  }, [])

  if (!enhancedVisual) {
    return (
      <div className="plate-fallback" aria-hidden="true">
        <span className="plate-fallback-shadow" />
        <span className="plate-fallback-outer" />
        <span className="plate-fallback-rim" />
        <span className="plate-fallback-inner" />
        <span className="plate-fallback-core" />
      </div>
    )
  }

  return (
    <Canvas
      camera={{ position: [0, 0, 4.6], fov: 38 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 5, 4]} intensity={1.2} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} color="#CD805D" />
      <Suspense fallback={null}>
        <Float speed={1.05} rotationIntensity={0.18} floatIntensity={0.35}>
          <Plate />
        </Float>
        <ContactShadows
          position={[0, -1.6, 0]}
          opacity={0.32}
          scale={6}
          blur={2.4}
          far={3}
          color="#55756F"
        />
        <Environment preset="apartment" />
      </Suspense>
    </Canvas>
  )
}
