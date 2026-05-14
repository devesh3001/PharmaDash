import { useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';

export function ScanModal({ isOpen, onClose }) {
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);
  const toast = useToast();
  const { addItem } = useCart();

  if (!isOpen) return null;

  async function handleScan() {
    setScanning(true);
    setResults(null);
    try {
      // In a real app, we would pass the actual file
      // const formData = new FormData();
      // formData.append('prescription', file);
      // const data = await api.scanPrescription(formData);
      
      const data = await api.scanPrescription({}); // Mocked
      setResults(data.medicines);
      toast.success('Prescription scanned successfully! 🔬');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setScanning(false);
    }
  }

  function addAll() {
    results.forEach(m => {
      // Map to full medicine object if needed, but addItem handles partials if structured right
      // In this app, addItem expects the medicine object
      addItem({ ...m, stock_quantity: 100 }); // Mock stock for added items
    });
    toast.success(`${results.length} items added to cart! 🛒`);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box scanner-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Smart Prescription Scanner</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-content">
          {!results && !scanning && (
            <div className="scanner-upload">
              <div className="scanner-icon">📄</div>
              <p>Upload a photo of your prescription and our AI will extract the medicines for you.</p>
              <input 
                type="file" 
                id="rx-upload" 
                hidden 
                onChange={(e) => setFile(e.target.files[0])} 
                accept="image/*"
              />
              <label htmlFor="rx-upload" className="btn-outline" style={{ cursor: 'pointer' }}>
                {file ? file.name : 'Select Image'}
              </label>
              {file && (
                <button className="btn-primary" onClick={handleScan} style={{ marginTop: '16px' }}>
                  Start AI Scan
                </button>
              )}
            </div>
          )}

          {scanning && (
            <div className="scanner-loading">
              <div className="scan-line"></div>
              <div className="scanner-visual">📄</div>
              <p>AI is analyzing your prescription...</p>
              <p className="scanner-sub">Reading handwriting, extracting medicines</p>
            </div>
          )}

          {results && (
            <div className="scanner-results">
              <h4>Extracted Medicines</h4>
              <div className="results-list">
                {results.map(m => (
                  <div key={m.id} className="result-item">
                    <span>💊 {m.name}</span>
                    <span className="result-check">✓</span>
                  </div>
                ))}
              </div>
              <div className="modal-cta">
                <button className="btn-outline" onClick={() => setResults(null)}>Re-scan</button>
                <button className="btn-primary" onClick={addAll}>Add to Cart</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
