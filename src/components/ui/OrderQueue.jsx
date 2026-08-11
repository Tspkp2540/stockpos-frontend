import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'https://stockpos-production-d146.up.railway.app';

export default function OrderQueue() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // ดึงข้อมูลออเดอร์จาก Backend API
  const fetchOrders = async () => {
    try {
      // Use configured API base (env `REACT_APP_API_URL`) or deployed Railway URL
      const response = await axios.get(`${API_BASE}/api/orders`);
      if (response.data.success) {
        setOrders(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // สามารถตั้ง Interval หรือรอรับ Socket.io มารีเฟรชตรงนี้ได้
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-cyan-400">📥 Live Orders Queue</h2>
        <button 
          onClick={fetchOrders}
          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-200 transition"
        >
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading ? (
          <p className="text-gray-400 text-sm text-center mt-4">กำลังโหลดข้อมูลออเดอร์...</p>
        ) : orders.length === 0 ? (
          <p className="text-gray-500 text-sm text-center mt-4">ยังไม่มีออเดอร์ในระบบ</p>
        ) : (
          orders.map((order) => (
            <div 
              key={order.id} 
              className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow hover:border-cyan-500 transition"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-sm text-white">#{order.order_no}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  order.status === 'COOKING' ? 'bg-yellow-900 text-yellow-300' :
                  order.status === 'COMPLETED' ? 'bg-green-900 text-green-300' :
                  'bg-red-900 text-red-300'
                }`}>
                  {order.status}
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-2">
                ช่องทาง: {order.channel_name || 'Front Store'}
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-cyan-300 font-bold">฿{Number(order.net_revenue || 0).toFixed(2)}</span>
                <div className="space-x-1">
                  <button className="bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded text-[10px]">
                    Done
                  </button>
                  <button className="bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded text-[10px]">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}