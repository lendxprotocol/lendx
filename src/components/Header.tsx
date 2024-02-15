import React, { useState, useEffect } from 'react';
import { Button, Card, Input } from "antd";
import TransactionHistory from './TransactionHistory'; // Import your TransactionHistory component
import logo from "../images/logo.png"

interface HeaderProps {
  unisatInstalled: boolean;
  connected: boolean;
  address: string;
  eConnected: boolean;
  eAddress: string;
  status?: { netWorth: number; netAPY: number; healthFactor: number };
  connectMetamaskWallet: () => void;
  handleAccountsChanged: (result: any) => void; // Replace with actual type for handleAccountsChanged
  unisat: any; // Replace with actual type for unisat
}

const Header: React.FC<HeaderProps> = ({
  unisatInstalled,
  connected,
  address,
  eConnected,
  eAddress,
  status,
  connectMetamaskWallet,
  handleAccountsChanged,
  unisat,
}) => {

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768); // Adjust the threshold as needed
    };

    handleResize(); // Call it once to initialize
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    
    <header className="App-header">
      {isMobile && (
        <div className="mobile-banner">
          This site is not compatible with mobile devices.
        </div>
      )}
          <div className="App-header-item">
            {/* App Icon */}
            <img
              src={logo} // Replace with your actual app icon URL
              alt="App Icon"
            />
            <div className="beta">BETA</div>
          <div>
            
          </div>
          {/* Menu */}
          {!isMobile && (
            <div className="App-link">
              {/*
                <div className="menu-item">
                    Dashboard
                    <div className="menu-line"></div>
                </div>
                 <div className="menu-item">
                  Quests
                  <div className="menu-line"></div>
                </div> */}
            </div>
          )}
          
          <div>

          { !unisatInstalled ? (
        
              <Button
              className="login-button"
                onClick={() => {
                  window.location.href = "https://unisat.io";
                }}
              >
                Install Unisat Wallet
              </Button>
          
          ) : (
        
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div>
              <Button
                className="login-button"
                onClick={() => window.open('https://faucet.quicknode.com/blast/sepolia', '_blank')}
              >
                <div>Blast Faucet</div>
              </Button>
            </div>
            &nbsp;
          
            <div>          
              <Button
                className="login-button"
                onClick={() => window.open('https://coinfaucet.eu/en/btc-testnet/', '_blank')}
              >
                <div>Bitcoin Faucet (Segwit)</div>
              </Button>
            </div>
           
            {connected ? (
                <TransactionHistory />            
            ): <div /> }
            &nbsp;
            <div>
              <Button
              className="login-button"
                onClick={async () => {
                  const result = await unisat.requestAccounts();
                  handleAccountsChanged(result);
                }}
              >
              {connected ? (
                <div>{address.substring(0, 5)}...{address.slice(-5)}</div>
              ) : (
                <div>Connect Unisat Wallet</div>
                
              )}
              </Button>
            </div>
            &nbsp;
            {/* New Connect Metamask Wallet Button */}
            <div>
              <Button
                className="login-button"
                onClick={connectMetamaskWallet}
              >
              {eConnected ? (
                <div>{eAddress.substring(0, 5)}...{eAddress.slice(-5)}</div>
              ) : (
                <div>Connect Metamask Wallet</div>
              )}
              </Button>
              </div>
            </div>
            )}
          </div>
        
        </div>
        <div style={{ width: '100%', borderBottom: '1px solid #475569', margin: '10px -10px -10px 0px' }}></div>
        
        <div className="App-header-content">
        <div style={{ display: 'flex', alignItems: 'center'}}>
          <img
            src="LendX_logoIcon_orange.png" // Replace with your actual app icon URL
            alt="LendX_logoIcon_orange"
            style={{ height: '50px', marginRight: '10px' }}
          />
          <div style={{ textAlign: 'left', fontSize: '40px', fontWeight: 'normal' }}>Market</div>
              {connected ? (
                <div style={{ marginLeft: 'auto', marginTop: '20px'}}>
                <table className="header-table"  >
                <thead>
                  <tr>
                    <th>Net worth</th>
                    <th>Net APY</th>
                    <th>Health factor</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Example row */}
                  <tr>
                    <th>${status?.netWorth.toFixed(2)}</th>
                    <th style={{ color: status && status.netAPY >= 0 ? 'lightgreen' : 'darkorange' }}>
                      {(status?.netAPY)?.toFixed(2)}%
                    </th>

                    <th style={{ color: status && status.healthFactor >= 1.2 ? 'lightgreen' : 'darkorange' }}>
                      {status?.healthFactor}
                    </th>

                  </tr>
                  {/* Add more rows as needed */}
                </tbody>
              </table>
              </div>
                ) : (
                  <div></div>
                )}
          </div>


        </div>
        
        {/* Connect Unisat Wallet Button and Address */}
        
      </header>
  );
};

export default Header;
