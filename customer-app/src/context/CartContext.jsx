import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const CartCtx = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pd_cart') ?? '[]'); }
    catch { return []; }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('pd_cart', JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((medicine) => {
    setItems(prev => {
      const ex = prev.find(i => i.medicine.id === medicine.id);
      if (ex) return prev.map(i => i.medicine.id === medicine.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { medicine, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((id) => setItems(prev => prev.filter(i => i.medicine.id !== id)), []);

  const updateQty = useCallback((id, qty) => {
    if (qty < 1) return;
    setItems(prev => prev.map(i => i.medicine.id === id ? { ...i, quantity: qty } : i));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = items.reduce((s, i) => s + parseFloat(i.medicine.price) * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartCtx.Provider value={{ items, open, setOpen, addItem, removeItem, updateQty, clearCart, total, count }}>
      {children}
    </CartCtx.Provider>
  );
}

export const useCart = () => useContext(CartCtx);
