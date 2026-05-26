import {Canvas} from "@react-three/fiber"
import Optimized from "./models/Optimized.jsx"
import {OrbitControls} from "@react-three/drei";

const ModelViewer = () => {
    return (
        <section className="w-screen h-screen flex justify-center items-center bg-white overflow-hidden">
            <Canvas id="canvas" camera={{ position: [0, 2, 5], fov: 50, near: 0.1, far: 100 }} >
            <ambientLight intensity={0.7}/>
                <directionalLight position={[5, 5, 5]} intensity={2}/>
            <Optimized scale={1}  position={[0,0,0]}/>
            <OrbitControls enableZoom={true} />
            </Canvas>
        </section>
    )
}

export default ModelViewer;
