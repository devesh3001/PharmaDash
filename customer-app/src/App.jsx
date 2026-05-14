import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider }          from './context/CartContext';
import { ToastProvider }         from './context/ToastContext';
import { ProtectedRoute }        from './components/ProtectedRoute';
import { LandingPage }           from './pages/LandingPage';
import { AuthPage }              from './pages/AuthPage';
import { HomePage }              from './pages/HomePage';
import { OrdersPage }            from './pages/OrdersPage';
import { OrderDetailPage }       from './pages/OrderDetailPage';
import { RiderDashboard }        from './pages/RiderDashboard';
import { AdminDashboard }        from './pages/AdminDashboard';

const SOCKET_URL = 'http://localhost:8080';
const DEFAULT_CENTER = [20.5937, 78.9629];
const DEFAULT_ZOOM = 6;
const LIVE_ZOOM = 15;

function MapCenterSync({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

function riderNeonIcon() {
  return L.divIcon({
    className: 'tracking-marker-root leaflet-div-icon',
    html: '<span class="tracking-marker-glow"></span><span class="tracking-marker-core"></span>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

/** Live map + Socket.IO: join room on mount, follow `location_update` events. */
export function TrackingScreen({ orderId }) {
  const [riderLatLng, setRiderLatLng] = useState(null);
  const icon = useMemo(() => riderNeonIcon(), []);

  useEffect(() => {
    if (!orderId) return;
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.emit('join_tracking_room', orderId);

    const onLocationUpdate = (payload) => {
      const lat = payload?.lat ?? payload?.latitude;
      const lng = payload?.lng ?? payload?.longitude;
      if (lat == null || lng == null) return;
      const nlat = Number(lat);
      const nlng = Number(lng);
      if (Number.isFinite(nlat) && Number.isFinite(nlng)) {
        setRiderLatLng({ lat: nlat, lng: nlng });
      }
    };

    socket.on('location_update', onLocationUpdate);
    return () => {
      socket.off('location_update', onLocationUpdate);
      socket.disconnect();
    };
  }, [orderId]);

  const center = riderLatLng ? [riderLatLng.lat, riderLatLng.lng] : DEFAULT_CENTER;
  const zoom = riderLatLng ? LIVE_ZOOM : DEFAULT_ZOOM;

  return (
    <section className="tracking-screen od-section" aria-label="Live delivery tracking">
      <h2 className="od-section-title">Live tracking</h2>
      <p className="tracking-screen-meta">
        {riderLatLng
          ? 'Rider location updates in real time.'
          : 'Waiting for rider GPS… map centers when the first update arrives.'}
      </p>
      <div className="tracking-map-frame">
        <MapContainer
          key={orderId}
          center={center}
          zoom={zoom}
          className="tracking-map-container"
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MapCenterSync center={center} zoom={zoom} />
          {riderLatLng && (
            <Marker position={[riderLatLng.lat, riderLatLng.lng]} icon={icon} />
          )}
        </MapContainer>
      </div>
    </section>
  );
}

import { SplashScreen }            from './components/SplashScreen';

/** After login, redirect to the right home screen by role */
function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user)   return <LandingPage />;
  if (user.role === 'RIDER') return <Navigate to="/rider" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <Navigate to="/medicines" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <CartProvider>
          <Routes>
            {/* Public — smart home */}
            <Route path="/"            element={<RoleHome />} />
            <Route path="/auth"        element={<AuthPage />} />

            {/* Customer */}
            <Route path="/medicines"   element={<ProtectedRoute roles={['CUSTOMER']}><HomePage /></ProtectedRoute>} />
            <Route path="/orders"      element={<ProtectedRoute roles={['CUSTOMER']}><OrdersPage /></ProtectedRoute>} />
            <Route path="/orders/:id"  element={<ProtectedRoute roles={['CUSTOMER','RIDER','ADMIN']}><OrderDetailPage /></ProtectedRoute>} />

            {/* Rider */}
            <Route path="/rider"       element={<ProtectedRoute roles={['RIDER','ADMIN']}><RiderDashboard /></ProtectedRoute>} />

            {/* Admin */}
            <Route path="/admin"       element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />

            <Route path="*"            element={<Navigate to="/" replace />} />
          </Routes>
        </CartProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
