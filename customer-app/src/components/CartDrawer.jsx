import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api/client';

const DELIVERY_FEE = 29;
const FREE_THRESHOLD = 499;

export function CartDrawer() {
  const { items, open, setOpen, updateQty, removeItem, clearCart, total } = useCart();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [promo, setPromo]     = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLat, setDeliveryLat] = useState(null);
  const [deliveryLng, setDeliveryLng] = useState(null);
  const [locating, setLocating] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [isEmergency, setIsEmergency] = useState(false);
  const navigate = useNavigate();

  const deliveryFee = total >= FREE_THRESHOLD ? 0 : DELIVERY_FEE;
  const discount    = promoApplied ? Math.round(total * 0.1) : 0;
  const sosFee      = isEmergency ? 99 : 0;
  const grandTotal  = total - discount + deliveryFee + sosFee;
  const toFreeDelivery = FREE_THRESHOLD - total;

  function handleCheckout() {
    setShowDeliveryModal(true);
  }

  function continueToPayment() {
    if (!deliveryAddress.trim()) {
      toast.error('Please enter a delivery address');
      return;
    }
    setShowDeliveryModal(false);
    setShowPaymentModal(true);
  }

  function getLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeliveryLat(pos.coords.latitude);
        setDeliveryLng(pos.coords.longitude);
        setDeliveryAddress((prev) => prev ? prev : `GPS Coordinates saved`);
        toast.success('Location found!');
        setLocating(false);
      },
      (err) => {
        toast.error('Unable to retrieve your location');
        setLocating(false);
      }
    );
  }

  async function confirmPayment() {
    setLoading(true);
    setError('');
    try {
      const { order } = await api.createOrder({
        items: items.map(i => ({ medicineId: i.medicine.id, quantity: i.quantity })),
        delivery_address: deliveryAddress,
        delivery_lat: deliveryLat,
        delivery_lng: deliveryLng,
        is_emergency: isEmergency,
      });
      await api.processPayment(order.id, { method: paymentMethod });
      clearCart();
      setOpen(false);
      setShowPaymentModal(false);
      setPromoApplied(false);
      setPromo('');
      toast.success('Order placed successfully! 🚀');
      navigate(`/orders/${order.id}`);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyPromo() {
    if (promo.trim().toUpperCase() === 'PHARMA10') {
      setPromoApplied(true);
      toast.success('Promo code applied! 10% discount 🎉');
    } else {
      toast.error('Invalid promo code');
    }
  }

  return (
    <>
      <div className={`drawer-overlay ${open ? 'visible' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`cart-drawer ${open ? 'open' : ''}`}>
        <div className="drawer-head">
          <div>
            <h2>Your Cart <span className="cart-count">{items.reduce((s, i) => s + i.quantity, 0)}</span></h2>
            <p className="drawer-sub">🏥 CityCare Pharmacy — Downtown</p>
          </div>
          <button id="close-cart-btn" className="close-btn" onClick={() => setOpen(false)}>✕</button>
        </div>

        {/* Free delivery progress */}
        {items.length > 0 && toFreeDelivery > 0 && (
          <div className="free-del-bar">
            <span>Add ₹{toFreeDelivery.toFixed(0)} more for <strong>FREE delivery</strong></span>
            <div className="free-del-progress">
              <div className="free-del-fill" style={{ width: `${Math.min((total / FREE_THRESHOLD) * 100, 100)}%` }} />
            </div>
          </div>
        )}
        {items.length > 0 && toFreeDelivery <= 0 && (
          <div className="free-del-bar achieved">🎉 You've unlocked <strong>FREE delivery!</strong></div>
        )}

        {items.length === 0 ? (
          <div className="cart-empty">
            <span className="empty-icon">🛒</span>
            <p>Your cart is empty</p>
            <p className="cart-empty-sub">Browse medicines and add them here</p>
            <button id="browse-medicines-btn" className="btn-primary" onClick={() => setOpen(false)}>Browse Medicines</button>
          </div>
        ) : (
          <>
            <ul className="cart-list">
              {items.map(({ medicine, quantity }) => (
                <li key={medicine.id} className="cart-item">
                  <div className="ci-icon">💊</div>
                  <div className="ci-info">
                    <span className="ci-name">{medicine.name}</span>
                    <span className="ci-sub">₹{parseFloat(medicine.price).toFixed(2)} each</span>
                  </div>
                  <div className="ci-right">
                    <div className="ci-controls">
                      <button className="qty-btn" onClick={() => quantity === 1 ? removeItem(medicine.id) : updateQty(medicine.id, quantity - 1)}>−</button>
                      <span className="qty-val">{quantity}</span>
                      <button className="qty-btn" onClick={() => updateQty(medicine.id, quantity + 1)}>+</button>
                    </div>
                    <span className="ci-total">₹{(parseFloat(medicine.price) * quantity).toFixed(2)}</span>
                  </div>
                </li>
              ))}
            </ul>

            {/* Promo code */}
            <div className="promo-row">
              <input
                className="promo-input"
                placeholder="Promo code (try PHARMA10)"
                value={promo}
                onChange={e => setPromo(e.target.value)}
                disabled={promoApplied}
              />
              <button className="promo-btn" onClick={applyPromo} disabled={promoApplied || !promo.trim()}>
                {promoApplied ? '✓ Applied' : 'Apply'}
              </button>
            </div>

            <div className="drawer-foot">
              {error && <p className="cart-error">⚠ {error}</p>}

              {/* Bill breakdown */}
              <div className="bill-breakdown">
                <div className="bill-row">
                  <span>Item total</span>
                  <span>₹{total.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="bill-row discount">
                    <span>Promo discount</span>
                    <span>−₹{discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="bill-row">
                  <span>Delivery fee {deliveryFee === 0 && <span className="free-tag">FREE</span>}</span>
                  <span className={deliveryFee === 0 ? 'strikethrough' : ''}>
                    ₹{DELIVERY_FEE.toFixed(2)}
                  </span>
                </div>
                {isEmergency && (
                  <div className="bill-row emergency" style={{ color: 'var(--red)' }}>
                    <span>SOS Priority Fee</span>
                    <span>₹99.00</span>
                  </div>
                )}
                <div className="bill-divider" />
                <div className="bill-row total-row">
                  <strong>To Pay</strong>
                  <strong>₹{grandTotal.toFixed(2)}</strong>
                </div>
              </div>

              <div className="delivery-eta">
                🕐 Estimated delivery: <strong>30–45 min</strong>
              </div>

              <button
                id="place-order-btn"
                className="btn-checkout"
                onClick={handleCheckout}
                disabled={loading}
              >
                {loading ? <span className="spinner-sm" /> : `🚀 Place Order — ₹${grandTotal.toFixed(2)}`}
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Delivery Details Modal */}
      {showDeliveryModal && (
        <div className="modal-overlay" onClick={() => !loading && setShowDeliveryModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header" style={{ flexDirection: 'column', paddingBottom: 0 }}>
              <h3 style={{ color: 'var(--white)' }}>Delivery Details</h3>
              <p style={{ color: 'var(--text2)', fontSize: '14px' }}>Where should we deliver your order?</p>
            </div>
            <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', color: 'var(--text)', fontWeight: '500' }}>Address</label>
                <textarea 
                  className="input-field" 
                  rows="3" 
                  placeholder="Enter complete address (House/Flat No, Street, Landmark)"
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  style={{ resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📍</span>
                  <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                    {deliveryLat && deliveryLng ? (
                      <span style={{ color: 'var(--green)' }}>GPS Location Saved</span>
                    ) : (
                      <span>Share exact location for faster delivery</span>
                    )}
                  </div>
                </div>
                <button className="btn-outline-sm" onClick={getLocation} disabled={locating} style={{ padding: '6px 12px' }}>
                  {locating ? 'Locating...' : (deliveryLat ? 'Update' : 'Locate Me')}
                </button>
              </div>

              {/* SOS Toggle */}
              <div style={{ 
                marginTop: '8px', 
                padding: '16px', 
                background: isEmergency ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface)', 
                border: `1px solid ${isEmergency ? 'var(--red)' : 'var(--border)'}`, 
                borderRadius: 'var(--r-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }} onClick={() => setIsEmergency(!isEmergency)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>🚨</span>
                  <div>
                    <h4 style={{ color: isEmergency ? 'var(--red)' : 'var(--white)', margin: 0, fontSize: '14px', fontWeight: 600 }}>SOS Emergency</h4>
                    <p style={{ color: 'var(--text2)', margin: 0, fontSize: '12px' }}>Instant, non-batched delivery</p>
                  </div>
                </div>
                <div style={{ 
                  width: '40px', 
                  height: '20px', 
                  background: isEmergency ? 'var(--red)' : 'var(--border)', 
                  borderRadius: '10px', 
                  position: 'relative',
                  transition: 'background 0.3s'
                }}>
                  <div style={{ 
                    width: '16px', 
                    height: '16px', 
                    background: 'white', 
                    borderRadius: '50%', 
                    position: 'absolute', 
                    top: '2px', 
                    left: isEmergency ? '22px' : '2px',
                    transition: 'left 0.3s ease'
                  }} />
                </div>
              </div>

            </div>
            
            <div className="modal-cta" style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowDeliveryModal(false)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={continueToPayment}>
                Continue to Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Selection Modal */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => !loading && setShowPaymentModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header" style={{ flexDirection: 'column', paddingBottom: 0 }}>
              <h3 style={{ color: 'var(--white)' }}>Select Payment Method</h3>
              <p style={{ color: 'var(--text2)', fontSize: '14px' }}>Choose how you want to pay for this order.</p>
            </div>
            <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: paymentMethod === 'COD' ? 'var(--cyan-dim)' : 'var(--surface)', border: `1px solid ${paymentMethod === 'COD' ? 'var(--cyan)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <input type="radio" name="payment" value="COD" checked={paymentMethod === 'COD'} onChange={(e) => setPaymentMethod(e.target.value)} style={{ width: '18px', height: '18px', accentColor: 'var(--cyan)' }} />
                <div>
                  <div style={{ color: 'var(--white)', fontWeight: '600' }}>Cash on Delivery</div>
                  <div style={{ fontSize: '12px', color: 'var(--text)' }}>Pay at your doorstep</div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: paymentMethod === 'MOCK_UPI' ? 'var(--cyan-dim)' : 'var(--surface)', border: `1px solid ${paymentMethod === 'MOCK_UPI' ? 'var(--cyan)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <input type="radio" name="payment" value="MOCK_UPI" checked={paymentMethod === 'MOCK_UPI'} onChange={(e) => setPaymentMethod(e.target.value)} style={{ width: '18px', height: '18px', accentColor: 'var(--cyan)' }} />
                <div>
                  <div style={{ color: 'var(--white)', fontWeight: '600' }}>UPI (Mock)</div>
                  <div style={{ fontSize: '12px', color: 'var(--text)' }}>Pay via any UPI app</div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: paymentMethod === 'MOCK_CARD' ? 'var(--cyan-dim)' : 'var(--surface)', border: `1px solid ${paymentMethod === 'MOCK_CARD' ? 'var(--cyan)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <input type="radio" name="payment" value="MOCK_CARD" checked={paymentMethod === 'MOCK_CARD'} onChange={(e) => setPaymentMethod(e.target.value)} style={{ width: '18px', height: '18px', accentColor: 'var(--cyan)' }} />
                <div>
                  <div style={{ color: 'var(--white)', fontWeight: '600' }}>Credit / Debit Card (Mock)</div>
                  <div style={{ fontSize: '12px', color: 'var(--text)' }}>Simulate a card payment</div>
                </div>
              </label>

              {error && <p className="cart-error" style={{ marginTop: '8px' }}>⚠ {error}</p>}
            </div>
            
            <div className="modal-cta" style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowPaymentModal(false)} disabled={loading}>Cancel</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={confirmPayment} disabled={loading}>
                {loading ? <span className="spinner-sm" /> : `Pay ₹${grandTotal.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
