import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from "antd";
import Popup from '../Popup'; // Import your Popup component
import TransactionHistoryTable from './TransactionHistoryTable'; // Import your TransactionHistoryTable component
import loadingImage from '../images/loading.gif'
import * as dotenv from 'dotenv';
dotenv.config();

const LENDX_API_BASE_URL = process.env.REACT_APP_LENDX_API_BASE_URL;

function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingMessages, setPendingMessages] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPendingMessages = async () => {
      try {
        const unisat = (window as any).unisat;
        const walletAddress = await unisat.getAccounts();
        const response = await axios.get(`${LENDX_API_BASE_URL}/api/getPendingMessages?wallet_address=${walletAddress}`);
        setPendingMessages(response.data.count);
        setError(null); // Reset error state on successful fetch
      } catch (error) {
        console.error('Error fetching pending messages:', error);
        //setError('Error fetching pending messages'); // Set error state on fetch error
      }
    };

    const intervalId = setInterval(() => {
      fetchPendingMessages();
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const handleTransactionHistoryClick = async () => {
    try {
      const unisat = (window as any).unisat;
      const walletAddress = await unisat.getAccounts();

      setIsLoading(true);
      setError(null); // Reset error state before fetching transaction history

      const response = await axios.get(`${LENDX_API_BASE_URL}/api/getTransactionHistory?wallet_address=${walletAddress}`);

      const fetchedTransactions = response.data.data;
      setTransactions(fetchedTransactions);
      setIsPopupOpen(true);
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      //setError('Error fetching transaction history'); // Set error state on fetch error
    } finally {
      setIsLoading(false);
    }
  };

  const closePopup = () => {
    setIsPopupOpen(false);
  };

  return (
    <div>
       &nbsp;
      <Button className="login-button" onClick={handleTransactionHistoryClick}>
        <div>
          Transaction History
          {pendingMessages > 0 && (
            <span style={{ marginLeft: '5px' }}>
              {`(${pendingMessages} pending)`} <img src={loadingImage} alt="Loading" />
            </span>
          )}
        </div>
      </Button>

      <Popup isOpen={isPopupOpen} onClose={closePopup} isLoading={isLoading}>
        {error ? (
          <div>Error: {error}</div>
        ) : (
          <TransactionHistoryTable transactions={transactions} />
        )}
      </Popup>
    </div>
  );
}

export default TransactionHistory;
