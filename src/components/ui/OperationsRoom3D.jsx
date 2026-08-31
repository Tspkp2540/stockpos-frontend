import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace } from "three";
import fallbackRoom from "../../assets/operations-dollhouse-room-blended.png";

function Box({ args, color, position, rotation, roughness = 0.72 }) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

function Cylinder({ args, color, position, rotation }) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation}>
      <cylinderGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}

const stockDetails = (item) => {
  const quantity = Number(item?.stock_qty ?? item?.stock ?? 0);
  const minimum = Number(item?.min_stock_alert ?? 0);
  const isLow =
    Boolean(item?.is_low_stock) ||
    item?.level === "low" ||
    (minimum > 0 && quantity <= minimum);

  return {
    id: item?.id ?? item?.code ?? "",
    name: item?.name || item?.ingredient_name || "วัตถุดิบ",
    quantity,
    unit: item?.unit || "หน่วย",
    minimum,
    isLow,
  };
};

function StockItem({ item, index, onHover, onLeave }) {
  const details = stockDetails(item);
  const column = index % 5;
  const row = Math.floor(index / 5);
  const x = -1.18 + column * 0.59;
  const height = 0.32 + Math.min(Math.max(details.quantity / Math.max(details.minimum || 10, 1), 0.25), 1.2) * 0.26;
  const y = 0.82 + row * 0.87 + height / 2;
  const color = details.isLow ? "#f2aa62" : index % 2 ? "#79bfdf" : "#b9d9a9";
  const hoverHandlers = {
    onPointerOver: (event) => {
      event.stopPropagation();
      onHover(item);
    },
    onPointerOut: (event) => {
      event.stopPropagation();
      onLeave();
    },
  };

  if (index % 3 === 1) {
    return (
      <mesh castShadow receiveShadow position={[x, y, 0.67]} {...hoverHandlers}>
        <cylinderGeometry args={[0.17, 0.2, height, 16]} />
        <meshStandardMaterial color={color} roughness={0.58} />
      </mesh>
    );
  }

  return (
    <mesh castShadow receiveShadow position={[x, y, 0.67]} {...hoverHandlers}>
      <boxGeometry args={[0.42, height, 0.4]} />
      <meshStandardMaterial color={color} roughness={0.62} />
    </mesh>
  );
}

function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 3.6, 12.8);
    camera.lookAt(0, 1.65, -2.15);
  }, [camera]);

  return null;
}

const currency = (value) => `฿${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function useDashboardTexture(draw, dependencies) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 620;
    const context = canvas.getContext("2d");
    draw(context, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, dependencies);
}

function Screen({ texture, position, width = 3.1, height = 2.05 }) {
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group position={position}>
      <Box args={[width + 0.13, height + 0.13, 0.12]} color="#17476b" position={[0, 0, -0.04]} roughness={0.42} />
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function OrderDashboard({ orders }) {
  const texture = useDashboardTexture(
    (context, width, height) => {
      context.fillStyle = "#082f49";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#0ea5e9";
      context.fillRect(0, 0, width, 88);
      context.fillStyle = "#ffffff";
      context.font = "700 38px Kanit, Tahoma, sans-serif";
      context.fillText("คิวออเดอร์", 42, 58);
      context.font = "500 22px Kanit, Tahoma, sans-serif";
      context.fillText(`${orders.length} รายการกำลังทำ`, width - 275, 55);

      if (!orders.length) {
        context.fillStyle = "#e0f2fe";
        context.font = "600 30px Kanit, Tahoma, sans-serif";
        context.fillText("ยังไม่มีคิวที่กำลังจัดเตรียม", 110, 320);
        return;
      }

      orders.slice(0, 3).forEach((order, index) => {
        const y = 122 + index * 150;
        context.fillStyle = "#e0f2fe";
        context.fillRect(32, y, width - 64, 118);
        context.fillStyle = "#0284c7";
        context.fillRect(32, y, 14, 118);
        const queue = order.order_no || order.id || index + 1;
        const customer = order.customer_nickname || order.customer_name || "ลูกค้าหน้าร้าน";
        context.fillStyle = "#0f172a";
        context.font = "700 34px Kanit, Tahoma, sans-serif";
        context.fillText(`#${queue}`, 72, y + 48);
        context.font = "500 27px Kanit, Tahoma, sans-serif";
        context.fillText(String(customer).slice(0, 22), 72, y + 88);
        context.fillStyle = "#d97706";
        context.font = "700 24px Kanit, Tahoma, sans-serif";
        context.fillText("กำลังทำ", width - 175, y + 69);
      });
    },
    [orders],
  );

  return <Screen texture={texture} position={[-4.15, 2.7, -4.02]} width={3.35} height={2.16} />;
}

function FinanceDashboard({ financialSummary }) {
  const texture = useDashboardTexture(
    (context, width, height) => {
      const revenue = Number(financialSummary?.revenue || 0);
      const expenses = Number(financialSummary?.expenses || 0);
      const profit = Number(financialSummary?.profit || 0);
      const rows = [
        ["ยอดขาย", revenue, "#38bdf8"],
        ["ค่าใช้จ่าย", expenses, "#fbbf24"],
        ["กำไร", profit, profit >= 0 ? "#34d399" : "#fb7185"],
      ];
      const maximum = Math.max(revenue, expenses, Math.abs(profit), 1);

      context.fillStyle = "#082f49";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#1d4ed8";
      context.fillRect(0, 0, width, 88);
      context.fillStyle = "#ffffff";
      context.font = "700 36px Kanit, Tahoma, sans-serif";
      context.fillText("การเงินวันนี้", 42, 58);

      rows.forEach(([label, value, color], index) => {
        const y = 135 + index * 145;
        context.fillStyle = "#dbeafe";
        context.font = "600 28px Kanit, Tahoma, sans-serif";
        context.fillText(label, 46, y);
        context.fillStyle = "#ffffff";
        context.font = "700 33px Kanit, Tahoma, sans-serif";
        context.fillText(currency(value), 46, y + 44);
        context.fillStyle = "#164e63";
        context.fillRect(46, y + 70, width - 92, 22);
        context.fillStyle = color;
        context.fillRect(46, y + 70, (width - 92) * Math.min(Math.abs(value) / maximum, 1), 22);
      });
    },
    [financialSummary],
  );

  return <Screen texture={texture} position={[4.25, 2.7, -4.02]} width={3.05} height={2.16} />;
}

function Plant({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <Cylinder args={[0.24, 0.3, 0.42, 16]} color="#d6a977" position={[0, 0.21, 0]} />
      {[
        [-0.18, 0.63, 0.04, -0.55],
        [0.17, 0.72, 0.02, 0.55],
        [0.02, 0.83, 0.14, 0.1],
      ].map(([x, y, z, tilt], index) => (
        <mesh key={index} castShadow position={[x, y, z]} rotation={[tilt, 0, tilt]}>
          <sphereGeometry args={[0.25, 12, 12]} />
          <meshStandardMaterial color="#3f8f6a" roughness={0.68} />
        </mesh>
      ))}
    </group>
  );
}

function Worker({
  position,
  rotation = 0,
  scale = 1,
  shirt = "#fffaf4",
  apron = "#276ba4",
  activity = "idle",
  activityLevel = 0,
}) {
  const root = useRef(null);
  const leftArm = useRef(null);
  const rightArm = useRef(null);
  const head = useRef(null);
  const crate = useRef(null);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const pace = 2.4 + Math.min(activityLevel, 6) * 0.28;
    const pulse = Math.sin(time * pace);

    root.current.position.y = position[1] + Math.sin(time * 1.7) * 0.015;
    leftArm.current.rotation.set(0, 0, 0.13);
    rightArm.current.rotation.set(0, 0, -0.13);
    head.current.rotation.set(0, 0, 0);

    if (activity === "barista" && activityLevel > 0) {
      leftArm.current.rotation.x = pulse * 0.42 - 0.22;
      rightArm.current.rotation.x = Math.sin(time * pace + 1.2) * 0.32 + 0.24;
      head.current.rotation.y = Math.sin(time * 1.1) * 0.12;
    }

    if (activity === "stock") {
      const lift = (Math.sin(time * pace * 0.7) + 1) / 2;
      leftArm.current.rotation.x = -0.55 + lift * 0.78;
      rightArm.current.rotation.x = -0.55 + lift * 0.78;
      head.current.rotation.x = 0.12 + Math.sin(time * 1.1) * 0.06;
      crate.current.position.y = 0.88 + lift * 0.92;
      crate.current.rotation.y = Math.sin(time * pace * 0.7) * 0.08;
    }

    if (activity === "admin") {
      leftArm.current.rotation.x = -0.5 + Math.sin(time * 5.2) * 0.12;
      rightArm.current.rotation.x = -0.5 + Math.sin(time * 5.2 + Math.PI) * 0.12;
      head.current.rotation.x = 0.18 + Math.sin(time * 1.3) * 0.04;
    }
  });

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={scale}>
      <Box args={[0.25, 0.92, 0.28]} color="#253a55" position={[-0.18, 0.48, 0]} rotation={[-0.05, 0, 0]} />
      <Box args={[0.25, 0.92, 0.28]} color="#253a55" position={[0.18, 0.48, 0]} rotation={[0.05, 0, 0]} />
      <Box args={[0.76, 0.76, 0.42]} color={shirt} position={[0, 1.35, 0]} />
      <Box args={[0.56, 0.66, 0.45]} color={apron} position={[0, 1.22, 0.025]} />
      <group ref={leftArm} position={[-0.52, 1.66, 0]}>
        <Box args={[0.18, 0.72, 0.2]} color={shirt} position={[0, -0.34, 0]} />
      </group>
      <group ref={rightArm} position={[0.52, 1.66, 0]}>
        <Box args={[0.18, 0.72, 0.2]} color={shirt} position={[0, -0.34, 0]} />
      </group>
      <group ref={head} position={[0, 2.04, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.43, 24, 24]} />
          <meshStandardMaterial color="#f4c7ab" roughness={0.72} />
        </mesh>
      </group>
      <mesh castShadow position={[0, 2.29, -0.03]} scale={[1.08, 0.45, 1.05]}>
        <sphereGeometry args={[0.43, 24, 24]} />
        <meshStandardMaterial color="#2e2c32" roughness={0.72} />
      </mesh>
      {activity === "stock" ? (
        <mesh ref={crate} castShadow position={[0.64, 0.88, 0.55]}>
          <boxGeometry args={[0.58, 0.45, 0.48]} />
          <meshStandardMaterial color="#8dc5e2" roughness={0.7} />
        </mesh>
      ) : null}
    </group>
  );
}

const isStoreOrder = (order) => {
  const channel = String(order?.channel_name || order?.channel || "").toLowerCase();
  return (
    !channel ||
    /front|store|wholesale|walk.?in|หน้าร้าน|ขายส่ง/.test(channel)
  );
};

function WaitingVisitor({ order, queueIndex }) {
  const root = useRef(null);
  const leftLeg = useRef(null);
  const rightLeg = useRef(null);
  const leftArm = useRef(null);
  const rightArm = useRef(null);
  const isRider = !isStoreOrder(order);

  useFrame(({ clock }) => {
    const queuePositions = [
      [-4.25, -0.35],
      [-3.55, 0.48],
      [-2.85, 1.28],
      [-2.15, 2.02],
    ];
    const [x, z] = queuePositions[Math.min(queueIndex, queuePositions.length - 1)];

    root.current.position.set(x, Math.sin(clock.getElapsedTime() * 1.4 + queueIndex) * 0.012, z);
    root.current.rotation.y = 0;
    leftLeg.current.rotation.x = 0;
    rightLeg.current.rotation.x = 0;
    leftArm.current.rotation.x = -0.15;
    rightArm.current.rotation.x = -0.15;
  });

  const shirt = isRider ? "#facc15" : "#fca5a5";
  const pants = isRider ? "#273a56" : "#475569";

  return (
    <group ref={root} scale={0.82}>
      <group ref={leftLeg} position={[-0.18, 0.9, 0]}>
        <Box args={[0.26, 0.95, 0.3]} color={pants} position={[0, -0.46, 0]} />
      </group>
      <group ref={rightLeg} position={[0.18, 0.9, 0]}>
        <Box args={[0.26, 0.95, 0.3]} color={pants} position={[0, -0.46, 0]} />
      </group>
      <Box args={[0.78, 0.78, 0.44]} color={shirt} position={[0, 1.72, 0]} />
      <group ref={leftArm} position={[-0.52, 1.84, 0]}>
        <Box args={[0.19, 0.75, 0.21]} color={shirt} position={[0, -0.34, 0]} />
      </group>
      <group ref={rightArm} position={[0.52, 1.84, 0]}>
        <Box args={[0.19, 0.75, 0.21]} color={shirt} position={[0, -0.34, 0]} />
      </group>
      <mesh castShadow position={[0, 2.46, 0]}>
        <sphereGeometry args={[0.44, 24, 24]} />
        <meshStandardMaterial color="#f4c7ab" roughness={0.72} />
      </mesh>
      {isRider ? (
        <>
          <mesh castShadow position={[0, 2.62, 0]} scale={[1.13, 0.7, 1.1]}>
            <sphereGeometry args={[0.47, 24, 24]} />
            <meshStandardMaterial color="#ef4444" roughness={0.55} />
          </mesh>
          <Box args={[0.58, 0.12, 0.12]} color="#26384a" position={[0, 2.5, 0.39]} />
          <Box args={[0.55, 0.76, 0.22]} color="#2f5f8f" position={[0, 1.76, -0.34]} />
        </>
      ) : (
        <mesh castShadow position={[0, 2.7, -0.02]} scale={[1.08, 0.45, 1.05]}>
          <sphereGeometry args={[0.44, 24, 24]} />
          <meshStandardMaterial color="#5b3a29" roughness={0.72} />
        </mesh>
      )}
    </group>
  );
}

function CafeCounter() {
  return (
    <group position={[-4.3, 0, -1.65]}>
      <Box args={[3.25, 0.72, 1.1]} color="#76b8d0" position={[0, 0.36, 0]} />
      <Box args={[3.45, 0.18, 1.3]} color="#c6905d" position={[0, 0.81, 0]} />
      <Box args={[0.88, 0.52, 0.54]} color="#cdd6da" position={[-0.86, 1.17, -0.05]} />
      <Box args={[0.42, 0.62, 0.42]} color="#597588" position={[0.18, 1.21, -0.06]} />
      <Cylinder args={[0.13, 0.13, 0.52, 16]} color="#2d4354" position={[0.8, 1.12, -0.14]} />
      {[-0.82, 0.12].map((x) => (
        <group key={x} position={[x, 0, 1.05]}>
          <Cylinder args={[0.3, 0.34, 0.12, 16]} color="#9fcae1" position={[0, 0.65, 0]} />
          <Cylinder args={[0.08, 0.1, 0.6, 12]} color="#bc8958" position={[0, 0.3, 0]} />
        </group>
      ))}
      <Plant position={[-1.45, 0.92, -0.25]} scale={0.58} />
    </group>
  );
}

function StockShelves({ inventoryRows, onHoverItem, onLeaveItem }) {
  const visibleItems = inventoryRows.slice(0, 15);

  return (
    <group position={[0, 0, -3.45]}>
      <Box args={[3.3, 3.65, 0.2]} color="#9e714d" position={[0, 1.83, 0]} />
      {[0.68, 1.55, 2.42, 3.27].map((y) => (
        <Box key={y} args={[3.15, 0.12, 0.62]} color="#c28a59" position={[0, y, 0.32]} />
      ))}
      {visibleItems.map((item, index) => (
        <StockItem
          item={item}
          index={index}
          key={item.id ?? item.code ?? `${item.name}-${index}`}
          onHover={onHoverItem}
          onLeave={onLeaveItem}
        />
      ))}
    </group>
  );
}

function OfficeDesk() {
  return (
    <group position={[4.2, 0, -1.25]}>
      <Box args={[2.65, 0.16, 1.25]} color="#c6905d" position={[0, 0.78, 0]} />
      <Box args={[0.16, 0.74, 0.16]} color="#855a3e" position={[-1.1, 0.37, -0.45]} />
      <Box args={[0.16, 0.74, 0.16]} color="#855a3e" position={[1.1, 0.37, -0.45]} />
      <Box args={[0.16, 0.74, 0.16]} color="#855a3e" position={[-1.1, 0.37, 0.45]} />
      <Box args={[0.16, 0.74, 0.16]} color="#855a3e" position={[1.1, 0.37, 0.45]} />
      <Box args={[0.82, 0.54, 0.07]} color="#274b67" position={[0.14, 1.16, -0.12]} rotation={[-0.38, 0, 0]} />
      <Plant position={[1.12, 0, -0.9]} scale={0.7} />
    </group>
  );
}

function RoomScene({
  pendingOrders,
  lowStockRows,
  inventoryRows,
  activeOrders,
  financialSummary,
  isAdmin,
  onHoverItem,
  onLeaveItem,
}) {
  return (
    <>
      <color attach="background" args={["#eaf8ff"]} />
      <fog attach="fog" args={["#eaf8ff", 12, 24]} />
      <ambientLight intensity={1.5} />
      <directionalLight castShadow intensity={2.1} position={[5, 9, 6]} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <hemisphereLight intensity={0.75} color="#d7f4ff" groundColor="#b9d5cf" />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[14, 9]} />
        <meshStandardMaterial color="#e6be91" roughness={0.88} />
      </mesh>
      <Box args={[14, 4.4, 0.18]} color="#f8fafc" position={[0, 2.2, -4.2]} />
      <Box args={[0.2, 4.4, 8]} color="#f8fafc" position={[-6.9, 2.2, -0.25]} />
      <Box args={[0.2, 4.4, 8]} color="#f8fafc" position={[6.9, 2.2, -0.25]} />

      <CafeCounter />
      {activeOrders.slice(0, 4).map((order, index) => (
        <WaitingVisitor
          key={order.id ?? order.order_no ?? index}
          order={order}
          queueIndex={index}
        />
      ))}
      <StockShelves
        inventoryRows={inventoryRows}
        onHoverItem={onHoverItem}
        onLeaveItem={onLeaveItem}
      />
      <OfficeDesk />
      <OrderDashboard orders={activeOrders} />
      <FinanceDashboard financialSummary={financialSummary} />
      <Worker
        position={[-4.2, 0, -2.35]}
        rotation={0.12}
        scale={0.78}
        activity="barista"
        activityLevel={pendingOrders}
      />
      <Worker
        position={[0, 0, -2.75]}
        rotation={0.1}
        scale={0.8}
        activity="stock"
        activityLevel={Math.max(lowStockRows, 1)}
      />
      <Worker
        position={[4.1, 0, -1.92]}
        rotation={-0.58}
        scale={0.78}
        shirt="#f7fbff"
        apron="#8bbad4"
        activity={isAdmin ? "admin" : "idle"}
      />
    </>
  );
}

function useThreeDEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setEnabled(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return enabled;
}

export default function OperationsRoom3D({
  pendingOrders = 0,
  lowStockRows = 0,
  inventoryRows = [],
  activeOrders = [],
  financialSummary,
  isAdmin = false,
}) {
  const threeDEnabled = useThreeDEnabled();
  const [hoveredItem, setHoveredItem] = useState(null);
  const details = hoveredItem ? stockDetails(hoveredItem) : null;

  if (!threeDEnabled) {
    return (
      <img
        className="h-full w-full object-cover"
        src={fallbackRoom}
        alt="ห้องปฏิบัติการร้าน มีเคาน์เตอร์ สต็อก และออฟฟิศ"
      />
    );
  }

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 3.6, 12.8], fov: 40, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        aria-label="ห้องปฏิบัติการร้านแบบสามมิติ"
        onPointerMissed={() => setHoveredItem(null)}
      >
        <CameraRig />
        <RoomScene
          pendingOrders={pendingOrders}
          lowStockRows={lowStockRows}
          inventoryRows={inventoryRows}
          activeOrders={activeOrders}
          financialSummary={financialSummary}
          isAdmin={isAdmin}
          onHoverItem={setHoveredItem}
          onLeaveItem={() => setHoveredItem(null)}
        />
      </Canvas>

      {details ? (
        <aside className="pointer-events-none absolute right-3 top-3 z-10 w-52 rounded-2xl border border-sky-100 bg-white/95 p-3 text-left shadow-lg shadow-sky-950/10 backdrop-blur-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-600">
            วัตถุดิบในสต็อก
          </p>
          <strong className="mt-1 block truncate text-sm text-slate-900">{details.name}</strong>
          <p className="mt-1 text-xs text-slate-600">
            คงเหลือ <b className="text-slate-900">{details.quantity.toLocaleString()}</b> {details.unit}
          </p>
          <p className={`mt-1 text-xs font-bold ${details.isLow ? "text-amber-700" : "text-emerald-700"}`}>
            {details.isLow
              ? `ใกล้หมด${details.minimum ? ` · แจ้งเตือนที่ ${details.minimum}` : ""}`
              : "สต็อกปกติ"}
          </p>
        </aside>
      ) : null}
    </div>
  );
}
