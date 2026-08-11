import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import StoreScene from './components/3d/StoreScene';
import OrderQueue from './components/ui/OrderQueue';
import QuickPOS from './components/ui/QuickPOS';

function App() {
  return (
    <div className="w-full h-screen flex bg-gray-900 text-white overflow-hidden">
      {/* ซ้าย: คิวออเดอร์ */}
      <div className="w-1/4 p-4 border-r border-gray-700">
        <OrderQueue />
      </div>

      {/* กลาง: ฉาก 3D */}
      <div className="w-1/2 relative">
        <Canvas camera={{ position: [5, 5, 5], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <StoreScene />
          <OrbitControls />
          <Sky />
        </Canvas>
      </div>

      {/* ขวา: แผง POS */}
      <div className="w-1/4 p-4 border-l border-gray-700">
        <QuickPOS />
      </div>
    </div>
  );
}

export default App;