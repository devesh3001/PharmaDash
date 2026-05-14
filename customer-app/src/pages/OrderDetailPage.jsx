import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { Navbar } from '../components/Navbar';
import { CartDrawer } from '../components/CartDrawer';
import { StatusBadge } from '../components/StatusBadge';
import { TrackingScreen } from '../App.jsx';

const STEPS = ['PENDING', 'ACCEPTED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const STEP_LABELS = { PENDING: 'Order Placed', ACCEPTED: 'Accepted', OUT_FOR_DELIVERY: 'On the Way', DELIVERED: 'Delivered' };

export function OrderDetailPage() {
  const { id } = useParams();
  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getOrder(id)
      .then(({ order }) => setOrder(order))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const total = order?.orderItems?.reduce(
    (s, i) => s + parseFloat(i.unit_price) * i.quantity, 0
  ) ?? 0;

  const stepIdx    = order ? STEPS.indexOf(order.status) : -1;
  const isCancelled = order?.status === 'CANCELLED';

  return (
    <div className="app-layout">
      <Navbar />
      <CartDrawer />

      <main className="main-content">
        <div className="page-header">
          <Link to="/orders" className="back-link">← My Orders</Link>
        </div>

        {loading && <div className="page-center"><div className="spinner" /></div>}
        {error   && <div className="error-state"><p>⚠ {error}</p></div>}

        {!loading && !error && order && (
          <div className="order-detail">
            <div className="od-header">
              <div>
                <h1 className="od-id">Order #{order.id.slice(-8).toUpperCase()}</h1>
                <p className="od-date">
                  {new Date(order.createdAt).toLocaleString('en-IN', {
                    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            {/* Progress tracker */}
            {!isCancelled && (
              <div className="progress-track">
                {STEPS.map((step, idx) => (
                  <div key={step} className={`progress-step ${idx <= stepIdx ? 'done' : ''} ${idx === stepIdx ? 'current' : ''}`}>
                    <div className="step-dot" />
                    <span className="step-label">{STEP_LABELS[step]}</span>
                    {idx < STEPS.length - 1 && <div className="step-line" />}
                  </div>
                ))}
              </div>
            )}

            {isCancelled && (
              <div className="cancelled-banner">
                ❌ This order was cancelled
              </div>
            )}

            {!isCancelled && ['ACCEPTED', 'OUT_FOR_DELIVERY'].includes(order.status) && (
              <TrackingScreen key={order.id} orderId={order.id} />
            )}

            {order.rider && !isCancelled && (
              <div className="od-section" style={{ marginTop: '24px' }}>
                <h2 className="od-section-title">Delivery Partner</h2>
                <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--cyan-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                    🛵
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ color: 'var(--white)', margin: '0 0 4px', fontSize: '16px' }}>{order.rider.full_name}</h3>
                    <p style={{ color: 'var(--text)', margin: 0, fontSize: '14px' }}>{order.rider.phone_number}</p>
                  </div>
                  <a href={`tel:${order.rider.phone_number}`} className="btn-outline-sm" style={{ padding: '8px 12px' }}>
                    📞 Call
                  </a>
                </div>
              </div>
            )}

            {/* Items */}
            <div className="od-section">
              <h2 className="od-section-title">Items Ordered</h2>
              <ul className="od-items">
                {order.orderItems?.map(item => (
                  <li key={item.id} className="od-item">
                    <span className="oi-icon">💊</span>
                    <div className="oi-info">
                      <span className="oi-name">{item.medicine?.name ?? 'Medicine'}</span>
                      <span className="oi-qty">Qty: {item.quantity}</span>
                    </div>
                    <span className="oi-price">₹{(parseFloat(item.unit_price) * item.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>

              <div className="od-total">
                <span>Total Paid</span>
                <strong>₹{total.toFixed(2)}</strong>
              </div>
            </div>

            {order.pharmacy && (
              <div className="od-section">
                <h2 className="od-section-title">Fulfilling Pharmacy</h2>
                <div className="pharmacy-pill">
                  <span>🏥</span>
                  <span>{order.pharmacy.name}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
