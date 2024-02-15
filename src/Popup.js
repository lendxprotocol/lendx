// Popup.js

import React from 'react';
import './Popup.css';
import "./App.css";
const Popup = ({ isOpen, onClose, children, isLoading }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="popup-overlay">
      <div className="popup-content">
        <button className="login-button" onClick={onClose} style={{ padding: "10px" }}>
          Close
        </button>
        <br></br>
        {isLoading ? (
          <div className="popup-loading">Loading...</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default Popup;
