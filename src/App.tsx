  import React, { useEffect, useRef, useState } from "react";
  import "./App.css";
  import Header from './components/Header'; // Import your Header component
  import { Button, Card, Input } from "antd";
  import axios from "axios";
  import { Switch } from "antd";
  import Web3 from 'web3';
  import { AbiItem } from 'web3-utils';
  import LendXAbi from './abi/Lendx.json'; // Adjust the path based on your project structure
  import USDCAbi from './abi/USDC.json';
  import { Status, Currency, Supply, Borrow, SupplyBorrowInfo, TransactionInput, Output, PartialTransaction, PendingTransaction } from './interfaces'; // <-- Add the .ts extension
  import { ToastContainer, toast } from 'react-toastify';
  import 'react-toastify/dist/ReactToastify.css';
  import { renderSupplyTableRows } from './components/SupplyTableRenderers';
  import renderYourSupplyTableRows from "./components/YourSupplyTableRenderers"; // Import the function

  import * as dotenv from 'dotenv';
  import CustomToastWithLink from './components/CustomToast';
  dotenv.config();

  // Fetch poolWalletBalance
  const poolWalletAddress = process.env.REACT_APP_POOL_WALLET_ADDRESS;
  const poolBearerToken = process.env.REACT_APP_POOL_BEARER_TOKEN;
  const UNISAT_API_BASE_URL = process.env.REACT_APP_UNISAT_API_BASE_URL;
  const LENDX_API_BASE_URL = process.env.REACT_APP_LENDX_API_BASE_URL;
  const MEMPOOL_URL = process.env.REACT_APP_MEMPOOL_URL;
  const BLAST_SCAN_URL = process.env.REACT_APP_BLAST_SCAN_URL;
  const BLAST_RPC = 'https://sepolia.blast.io';
  const LENDX_CONTRACT = process.env.REACT_APP_LENDX_CONTRACT;
  const USDC_ADDRESS = process.env.REACT_APP_USDC_ADDRESS;
  const CollateralFactor = process.env.REACT_APP_COLLATERAL_FACTOR;
  const BorrowFactor = process.env.REACT_APP_BORROW_FACTOR;
  const BlastChainID = process.env.REACT_APP_BLAST_CHAIN_ID;

  function App() {    
    const [pendingTransactions, setPendingTransactions] = useState([]);    
    const [supplyBalance, setSupplyBalance] = useState(0);
    const [averageAPY, setAverageAPY] = useState(0);
    const [currencyData, setCurrencyData] = useState<Currency[]>([]);
    const [yourSuppliesData, setYourSuppliesData] = useState<Supply[]>([]);
    const [status, setStatus] = useState<Status>();    
    const [borrowedBalance, setBorrowedBalance] = useState(0);
    const [averageBorrowedAPY, setAverageBorrowedAPY] = useState(0);  
    const [yourBorrowData, setYourBorrowData] = useState<Borrow[]>([]);
    const [unisatInstalled, setUnisatInstalled] = useState(false);
    const [connected, setConnected] = useState(false);    
    const [address, setAddress] = useState("");
    const [eConnected, setEConnected] = useState(false);
    const [eAddress, setEAddress] = useState('');
    const [accounts, setAccounts] = useState<string[]>([]);
    const [publicKey, setPublicKey] = useState("");
    const [balance, setBalance] = useState({
      confirmed: 0,
      unconfirmed: 0,
      total: 0,
    });
    const [network, setNetwork] = useState("testnet");

    const getBasicInfo = async () => {
      const unisat = (window as any).unisat;
      const [address] = await unisat.getAccounts();
      setAddress(address);

      const publicKey = await unisat.getPublicKey();
      setPublicKey(publicKey);

      const balance = await unisat.getBalance();
      setBalance(balance);

      const network = await unisat.getNetwork();
      setNetwork(network);
    };

    const selfRef = useRef<{ accounts: string[] }>({
      accounts: [],
    });

    const self = selfRef.current;
    const handleAccountsChanged = (_accounts: string[]) => {
      if (self.accounts[0] === _accounts[0]) {
        // prevent from triggering twice
        return;
      }
      self.accounts = _accounts;
      if (_accounts.length > 0) {
        setAccounts(_accounts);
        setConnected(true);

        setAddress(_accounts[0]);

        getBasicInfo();
      } else {
        setConnected(false);
      }
    };

    const handleEAccountsChanged = (_accounts: string[]) => {
      
      if (_accounts.length > 0) {
        setEAddress(_accounts[0]);
        setEConnected(true);

      } else {
      }
    };

    const handleNetworkChanged = (network: string) => {
      setNetwork(network);
      getBasicInfo();
    };
    
    useEffect(() => {
      const fetchCurrencyData = async () => {
        try {
          const response = await axios.get(`${LENDX_API_BASE_URL}/api/getPool`);
      
          const poolData: Currency[] = response.data;
          
          const poolBalanceResponse = await axios.get(
            `${UNISAT_API_BASE_URL}/v1/indexer/address/${poolWalletAddress}/balance`,
            {
              headers: {
                Authorization: `Bearer ${poolBearerToken}`,
              },
            }
          );
          
          let myStatus: Status = {
            netWorth: 0.0,
            netAPY: 0.0,
            healthFactor: 0
          };

          let totalNetworth = 0.0;
          
          
          const unisat = (window as any).unisat;
          
          const walletBalance =  await unisat.getBalance();
          const [walletAddress] =  await unisat.getAccounts();
         
          //console.log(walletBalance.total);
          const responsePendingTransactions = await axios.get(`${LENDX_API_BASE_URL}/api/getPendingTransactions?wallet_address=${walletAddress}`);
          
          // Access the 'data' property from the response
          const fetchedPendingTransactions = responsePendingTransactions.data;
          
          
          setPendingTransactions(fetchedPendingTransactions);
          console.log(fetchedPendingTransactions);
          const mergedData: Currency[] = poolData.map((currency: Currency) => {
            let myWalletBalance = 0;
            let poolWalletBalance = 0;
            if (currency.symbol === "BTC")
            {
              if (walletBalance && walletBalance.total !== null) {
                myWalletBalance = walletBalance.total;
            } else {
                myWalletBalance = 0;
            }
              poolWalletBalance = poolBalanceResponse.data.data.satoshi + poolBalanceResponse.data.data.pendingSatoshi; // Extract satoshi value
            }

            let transactionArray: PendingTransaction[] = [];

            if (Array.isArray(fetchedPendingTransactions.data)) {
              transactionArray = fetchedPendingTransactions.data;
            } else if (typeof fetchedPendingTransactions.data === 'object' && fetchedPendingTransactions.data !== null) {
              // Convert the object values to an array
              transactionArray = Object.values(fetchedPendingTransactions.data);
            }
            
            totalNetworth = totalNetworth + transactionArray.reduce((accumulator: number, transaction: PendingTransaction) => {
              if (
                transaction.pool_id === currency.id &&
                (transaction.transaction_type === 'Withdrawal' || transaction.transaction_type === 'Borrow')
              ) {
                let tempAmount=0;
                if (currency.symbol === "BTC"){
                  tempAmount = transaction.amount / 100000000;
                }
                else
                {
                  tempAmount =  transaction.amount;
                }
                return accumulator + (tempAmount * currency.value);
              } else {
                return accumulator;
              }
            }, 0);
           

            return {
              ...currency,
              myWalletBalance,
              poolWalletBalance, // Add poolWalletBalance to the currency object
            };
          });
      
          
          const responseYourSupply = await axios.get(`${LENDX_API_BASE_URL}/api/getYourSupply?wallet_address=${walletAddress}`);
          const yourSuppliesData: Supply[] = responseYourSupply.data;
          //console.log("Your Supplies" + responseYourSupply.data);
        
          const mergedYourSuppliesData: Supply[] = yourSuppliesData.map((supply: Supply) => {
            
          const currencyObject = mergedData.find((currency) => currency.symbol === supply.symbol);

          let symbolValue=0;
            // Check if a matching currency object was found
            if (currencyObject) {
              // Use the value property of the currency object
              symbolValue = currencyObject.value ?? 0;
            } else {
              console.warn(`Currency object not found for symbol: ${supply.symbol}`);
            }

              if (supply.symbol === "BTC"){
                symbolValue =  symbolValue / 100000000;
              }
              totalNetworth = totalNetworth + (symbolValue) * (supply.amount !== undefined ? supply.amount : 0);
              return {
                ...supply,
                value: (symbolValue) * (supply.amount !== undefined ? supply.amount : 0),
                accrued_interest_value: (symbolValue) * (supply.accrued_interest !== undefined ? supply.accrued_interest : 0),
              };
            });
            

            const totalValue = mergedYourSuppliesData.reduce((accumulator, supply) => {
              return accumulator + (supply.value ?? 0); // Use 0 if supply.value is undefined
          }, 0);
          
          
            setSupplyBalance(totalValue);

            // Calculate the sum of APY values
            const totalApy = mergedYourSuppliesData.reduce((accumulator, supply) => {
              return accumulator + (supply.apy ?? 0); // Use 0 if supply.apy is undefined
            }, 0);

            // Calculate the average APY
            const averageAPY = mergedYourSuppliesData.length > 0 ? totalApy / mergedYourSuppliesData.length : 0;

            setAverageAPY(averageAPY);

            setYourSuppliesData(mergedYourSuppliesData);


            const responseYourBorrow = await axios.get(`${LENDX_API_BASE_URL}/api/getYourBorrow?wallet_address=${walletAddress}`);
            const yourBorrowData: Borrow[] = responseYourBorrow.data;
    
          
            const mergedYourBorrowData: Borrow[] = yourBorrowData.map((borrow: Borrow) => {
              
            const currencyObject = mergedData.find((currency) => currency.symbol === borrow.symbol);
  
            let symbolValue=0;
              // Check if a matching currency object was found
              if (currencyObject) {
                // Use the value property of the currency object
                symbolValue = currencyObject.value ?? 0;
              } else {
                console.warn(`Currency object not found for symbol: ${borrow.symbol}`);
              }
              const value = (symbolValue) * (borrow.amount !== undefined ? borrow.amount : 0);
              totalNetworth = totalNetworth - value;
                return {
                  ...borrow,
                  value: value,
                  accrued_interest_value: (symbolValue) * (borrow.accrued_interest !== undefined ? borrow.accrued_interest : 0),
                };
              });
             
  
              const totalBorrowedValue = mergedYourBorrowData.reduce((accumulator, borrow) => {
                return accumulator + (borrow.amount ?? 0); // Use 0 if borrow.value is undefined
            }, 0);
            
            
              setBorrowedBalance(totalBorrowedValue);
  
              // Calculate the sum of APY values
              const totalBorrowedApy = mergedYourBorrowData.reduce((accumulator, supply) => {
                return accumulator + (supply.apy ?? 0); // Use 0 if supply.apy is undefined
              }, 0);
  
              // Calculate the average APY
              const averageBorrowedAPY = mergedYourBorrowData.length > 0 ? totalBorrowedApy / mergedYourBorrowData.length : 0;
  
              setAverageBorrowedAPY(averageBorrowedAPY);
  
              setYourBorrowData(mergedYourBorrowData);


      
          // Set merged data to state
          setCurrencyData(mergedData);

          myStatus.netWorth = totalNetworth;
          myStatus.netAPY = averageAPY - averageBorrowedAPY;

          let parsedCollateralFactor=0.8;
          let parsedBorrowFactor=1;

          if (CollateralFactor !== undefined) {
            parsedCollateralFactor = parseFloat(CollateralFactor);
          }

          if (BorrowFactor !== undefined) {
            parsedBorrowFactor = parseFloat(BorrowFactor);
          }
          
          myStatus.healthFactor = parseFloat((totalValue * parsedCollateralFactor / (totalBorrowedValue / parsedBorrowFactor)).toFixed(2));
          setStatus(myStatus);

        } catch (error) {
          console.error('Error fetching currency data:', error);
        }
      };

      async function checkUnisat() {
        let unisat = (window as any).unisat;

        for (let i = 1; i < 10 && !unisat; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 100*i));
            unisat = (window as any).unisat;
        }

        if(unisat){
            setUnisatInstalled(true);
        }else if (!unisat)
            return;

        unisat.getAccounts().then((accounts: string[]) => {
            handleAccountsChanged(accounts);
        });

        unisat.on("accountsChanged", handleAccountsChanged);
        unisat.on("networkChanged", handleNetworkChanged);

        return () => {
            unisat.removeListener("accountsChanged", handleAccountsChanged);
            unisat.removeListener("networkChanged", handleNetworkChanged);
        };
      }
      
      checkUnisat().then();

      async function checkMetamask() {
        const ethereum = (window as any).ethereum;
        console.log(ethereum);
        if (ethereum && ethereum.isMetaMask) {
          
          // MetaMask is installed
          //setUnisatInstalled(true);

          // ethereum.on("accountsChanged", handleAccountsChanged);
          // ethereum.on("networkChanged", handleNetworkChanged);

          try {
            const accounts = await ethereum.request({ method: "eth_accounts" });
            console.log(accounts);
            handleEAccountsChanged(accounts);
          } catch (error) {
            console.error("Error getting accounts:", error);
          }

          // return () => {
          //   ethereum.removeListener("accountsChanged", handleAccountsChanged);
          //   ethereum.removeListener("networkChanged", handleNetworkChanged);
          // };

        } else {
          // MetaMask is not installed or not detected
          return;
        }
      }
      
      checkMetamask().then();
      
      fetchCurrencyData();
      const intervalId = setInterval(() => {
        fetchCurrencyData();
      }, 5000);
  
      return () => {
        clearInterval(intervalId);
      }; 
    }, []);

    const renderYourBorrowTableRows = () => {

      return yourBorrowData.map((borrow: Borrow) => (
        <tr key={borrow.id}>
          <th>
            <img
              src={`${borrow.symbol}.png`}
              alt={`${borrow.symbol}-logo`}
              style={{ height: "25px", marginRight: "10px" }}
            />
            {borrow.symbol}
          </th>
          
          <th>{(borrow.amount ? borrow.amount : 0)}
          <div className="supply-value">
            {borrow.value !== undefined ? `$${borrow.value.toFixed(2)}` : 'N/A'}
          </div>
          </th>

          <th>{borrow.apy}</th>
          
        <th>
          
          {(
            borrow.accrued_interest
            ?  borrow.accrued_interest.toFixed(4)
            : "0.00000000"
          )}
          <br />
          <div className="supply-value">
            {borrow.accrued_interest_value !== undefined ? `$${borrow.accrued_interest_value.toFixed(4)}` : 'N/A'}
          </div>
        </th>


          <th style={{width: "100px"}}>
            
            <RepayUSDC borrow={borrow} address={address}/>
          </th>
        </tr>
      ));
    };

    const renderBorrowTableRows = () => {
      return currencyData.map((currency: Currency) => {
        // Check if allowborrowing is true
        if (currency.allowborrowing) {
          return (
            <tr key={currency.id} className={currency.enabled ? "" : "disabled-row"}>
        
              <th>
                <img
                  src={`${currency.symbol}.png`}
                  alt={`${currency.symbol}-logo`}
                  style={{ height: "25px", marginRight: "10px" }}
                />
                {currency.symbol}
              </th>
              
              <th>{currency.maxBorrow = ((status?.netWorth ?? 0) * 0.8) / currency.value }
              <div className="supply-value">
              ${((status?.netWorth ?? 0) * 0.8).toFixed(2)}
              </div>
              </th>
    
              <th>{currency.borrow_apy}</th>
              <th style={{width: "100px"}}>
              {connected ? (
                <div><BorrowUSDC currency={currency} address={address}/></div>
                ) : (

                <div></div>
                
                )}
                
              </th>
            </tr>
          );
        } else {
          // Return null or an empty fragment if allowborrowing is not true
          return null;
        }
      });
    };
    interface Window {
      ethereum?: any;
    }
    const connectMetamaskWallet = async () => {
      try {
        const ethereum = (window as any).ethereum;

        // Request accounts from Metamask
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  
        // Update state with connected status and address
        setEConnected(true);
        setEAddress(accounts[0]);
      } catch (error) {
        console.error('Error connecting Metamask wallet:', error);
      }
    };

    const unisat = (window as any).unisat;

    const supplyTableRows = () => renderSupplyTableRows(currencyData, connected, address);
    const yourSupplyTableRows = () => renderYourSupplyTableRows(yourSuppliesData, status, address);

    return (
      <div className="App">
        <Header
        unisatInstalled={unisatInstalled}
        connected={connected}
        address={address}
        eConnected={eConnected}
        eAddress={eAddress}
        status={status}
        connectMetamaskWallet={connectMetamaskWallet}
        handleAccountsChanged={handleAccountsChanged}
        unisat={unisat}
      />
        <ToastContainer 
                    position="bottom-right" 
                    autoClose={5000} // Set autoClose to control how long the toasts stay visible (in milliseconds)
                    pauseOnFocusLoss={false}
            />
        <div className="contents">
          {connected ? (
            <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "start",
              width: "100%",
              justifyContent: "center", // Center horizontally
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              width: "50%",
              justifyContent: "center", // Center horizontally
            }}>
              <Card
                size="small"
                title="Your supplies"
                className="card"
              >
                <div style={{ display: 'flex', textAlign: "left"}}>
                <div style={{ background: '#f2f2f2', border: '1px solid #ccc', borderRadius: '5px', padding: '5px ', marginRight: '5px'}}>
                  Balance: ${supplyBalance.toFixed(2)}
                </div>
                <div style={{ background: '#f2f2f2', border: '1px solid #ccc', borderRadius: '5px', padding: '5px', marginRight: '5px'}}>APY: {averageAPY}%</div>
                <div style={{ background: '#f2f2f2', border: '1px solid #ccc', borderRadius: '5px', padding: '5px', marginRight: '5px'}}>
                  Collateral: ${supplyBalance.toFixed(2)}
                  </div>
                </div>
                <br/ >
                <table className="content-table">
                <thead>
                  <tr>
                    <th>Assets</th>
                    <th>Balance</th>
                    <th>APY</th>
                    <th>Collateral</th>
                    <th>Accrued Interest</th>
                    <th></th> {/* Empty heading for the "Supply" button column */}
                  </tr>
                </thead>
                <tbody>{yourSupplyTableRows()}</tbody>
              </table>
              </Card>
            </div>
          
            <div style={{
              display: "flex",
              alignItems: "center",
              width: "50%",
              justifyContent: "center", // Center horizontally
            }}>
              <Card
                size="small"
                title="Your borrows"
                className="card"
              >
                <div style={{ display: 'flex', textAlign: "left"}}>
                <div style={{ background: '#f2f2f2', border: '1px solid #ccc', borderRadius: '5px', padding: '5px ', marginRight: '5px'}}>
                  Total: ${borrowedBalance.toFixed(2)}
                </div>
                <div style={{ background: '#f2f2f2', border: '1px solid #ccc', borderRadius: '5px', padding: '5px', marginRight: '5px'}}>APY: {averageBorrowedAPY}%</div>
                <div style={{ background: '#f2f2f2', border: '1px solid #ccc', borderRadius: '5px', padding: '5px', marginRight: '5px'}}>Borrow power used: 0%</div>
                </div>
                <br/ >
                <table className="content-table">
                <thead>
                  <tr>
                    <th>Assets</th>
                    <th>Amount</th>
                    <th>APY</th>
                   
                    <th>Accrued Interest</th>
                    <th></th> {/* Empty heading for the "Supply" button column */}
                  </tr>
                </thead>
                <tbody>{renderYourBorrowTableRows()}</tbody>
              </table>
              </Card>
            </div>
          </div>
          ) : (
            <div></div>
          )}
          <div
            className="contents2"
          >
            <div className="contents-card">
              <Card size="small" title="Assets to supply" className="card">
              <div style={{ textAlign: "left", marginTop: 10 }}>
              <table className="content-table">
                <thead>
                  <tr>
                    <th>Assets</th>
                    <th>Price</th>
                    {connected && (
                      <th>Wallet Balance</th>
                    )}
                    
                    <th>APY</th>
                    <th></th> {/* Empty heading for the "Supply" button column */}
                  </tr>
                </thead>
                <tbody>{supplyTableRows()}</tbody>
              </table>
              </div>
            </Card>

            </div>
          
            <div className="contents-card">
              <Card
                size="small"
                title="Assets to borrow"
                className="card"
              >
                <div style={{ textAlign: "left", marginTop: 10 }}>
                <table className="content-table">
                  <thead>
                    <tr>
                      <th>Assets</th>
                      <th>Available</th>
                      <th>APY, variable</th>
                      <th></th> {/* Empty heading for the "Supply" button column */}
                    </tr>
                  </thead>
                  <tbody>{renderBorrowTableRows()}
                  </tbody>
                </table>
                </div>
              </Card>
            </div>
          </div>
        </div>   
          
        
      </div>
    );
  }

  

  function BorrowUSDC({ currency, address }: { currency: Currency; address: string }) {
    const [usdc, setUSDC] = useState(0);
    const [txid, setTxid] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    const handleSupply = async () => {
      if(usdc < 1){
        toast.error(CustomToastWithLink({message: "Borrow amount must be more than 1 USDC.", txid: ""}));
      }else if (usdc > currency.maxBorrow){
        toast.error(CustomToastWithLink({message: "Borrow amount more then allow amount.", txid: ""}));
      }else{
        try {
          setLoading(true);
  
          const ethereum = (window as any).ethereum;
  
          // Request account access
          const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
          const eAddress = accounts[0];

          // Check the current chain ID
          const chainId = await ethereum.request({ method: 'eth_chainId' });

          // Convert the chain ID to decimal
          const decimalChainId = parseInt(chainId, 16);

          console.log("BlastChainID: " + BlastChainID);
          // Define the target chain ID
          const targetChainId = parseInt(BlastChainID!==undefined ? BlastChainID : "0");

          console.log("targetChainId: " + targetChainId);

          if (decimalChainId !== targetChainId) {
            // Switch to the target chain
            try {
              await ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${targetChainId.toString(16)}` }],
              });
            } catch (error) {
              console.error('Error switching chain:');
              // Handle the error accordingly
            }
          }
          
          const borrowInfo = {
            walletAddress: eAddress,
            maxAmount: currency.maxBorrow,
            amount: usdc,
          };
  
          // Make an HTTP request to add supply info to the database
          const response = new Promise((resolve, reject) => {
            axios.post(`${LENDX_API_BASE_URL}/api/updateAllowToBorrow`, borrowInfo)
              .then(response => {
                resolve(response.data);
              })
              .catch(error => {
                reject(error);
              });
          });

          toast.promise( Promise.resolve(response), {
            pending: "Please wait. Checking allow limit.",   
            success: "You are allow to borrow.",         
            error: "You are not allow to borrow.",
          });

  
          const web3 = new Web3(BLAST_RPC);
          const contractAddress = LENDX_CONTRACT;
          // Ensure that TypeScript recognizes contractAbi as AbiItem[]
          const contractAbiArray: AbiItem[] = LendXAbi as AbiItem[];

          // Instantiate the contract
          const contract = new web3.eth.Contract(contractAbiArray, contractAddress);
          console.log(web3.utils.toWei(borrowInfo.amount.toString(), 'ether'));
          // Replace 'borrow' with the actual name of your borrow method
          const data = contract.methods.borrow(web3.utils.toWei(borrowInfo.amount.toString(), 'ether')).encodeABI();
          console.log(data);
          const gas = await contract.methods.borrow(web3.utils.toWei(borrowInfo.amount.toString(), 'ether')).estimateGas({ from: eAddress });
        

          // Prepare the transaction object
          const transactionObject = {
            from: eAddress,
            to: contractAddress,
            gas,
            data,
          };

          // Send the transaction using MetaMask
          const txid = await ethereum.request({
            method: 'eth_sendTransaction',
            params: [transactionObject],
          });
          
          // Add supply info to yourSupplies
          const supplyInfo = {
            walletAddress: address,
            poolId: currency.id,
            apy: currency.borrow_apy,
            amount: 0 - usdc,
            tx_id: txid,
          };

          // Make an HTTP request to add supply info to the database
          const response2 = new Promise((resolve, reject) => {
            axios.post(`${LENDX_API_BASE_URL}/api/addBorrowInfo`, supplyInfo)
              .then(response => {
                resolve(response.data);
              })
              .catch(error => {
                reject(error);
              });
          });

          toast.promise(response2, {
            pending: "Submitting borrow.",
            success: {render() {return CustomToastWithLink({message: "Borrow submitted successfully. ", txid: txid})}},
            error: "Error submitting borrow.",
          });

          // Set the transaction ID and clear any error
          setTxid('');
          setError('');
        } catch (e) {
          setTxid('');
          toast.error(CustomToastWithLink((e as any).message, ""));
          
        } finally {
          setLoading(false);
        }
      } 
    };
  
    return (
      <div>
        <div style={{ textAlign: 'right' }}>
          <Input
            style={{ width: '101px' }}
            defaultValue={usdc}
            onChange={(e) => {
              setUSDC(parseFloat(e.target.value));
            }}
          ></Input>
          <Button className="supply-button" style={{ marginTop: 5, marginLeft: 10 }} onClick={handleSupply} disabled={loading}>
            {loading ? 'Loading...' : 'BORROW'}
          </Button>
            {error && <div style={{ color: 'red', marginTop: 5 }}>{error}</div>}
            {txid && (
            <div style={{ color: "green", marginTop: 5 }}>
            <a
              href={BLAST_SCAN_URL + txid}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'green', marginTop: 5, textDecoration: 'none' }}
            >
              {`${txid.substring(0, 5)}....${txid.substring(txid.length - 5)}`}
            </a>
          </div>
          )}
        </div>
      </div>
    );
  }

  function RepayUSDC({ borrow, address }: { borrow: Borrow; address: string }) {
    const [usdc, setUSDC] = useState(0);
    const [txid, setTxid] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
  
    const handleSupply = async () => {

      if (usdc < 1) {
        toast.error(CustomToastWithLink({message: "Repay amount must be more than 1 USDC.", txid: ""}));
      } else if (usdc >  borrow.amount - borrow.accrued_interest){
        toast.error(CustomToastWithLink({message: "Repay amount more then borrowed amount.", txid: ""}));
      }else{
        try {
          
          const ethereum = (window as any).ethereum;

          if (!ethereum) {
            // Handle the case where MetaMask is not installed or not available
            throw new Error("MetaMask not available");
          }

          // Request account access
          const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
          const eAddress = accounts[0];

          // Check the current chain ID
          const chainId = await ethereum.request({ method: 'eth_chainId' });

          // Convert the chain ID to decimal
          const decimalChainId = parseInt(chainId, 16);

          console.log("BlastChainID: " + BlastChainID);
          // Define the target chain ID
          const targetChainId = parseInt(BlastChainID!==undefined ? BlastChainID : "0");

          console.log("targetChainId: " + targetChainId);

          if (decimalChainId !== targetChainId) {
            // Switch to the target chain
            try {
              await ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${targetChainId.toString(16)}` }],
              });
            } catch (error) {
              console.error('Error switching chain:');
              // Handle the error accordingly
            }
          }

          const web3 = new Web3(BLAST_RPC);
          const contractAddress = LENDX_CONTRACT;
          const lendXContractAbiArray: AbiItem[] = LendXAbi as AbiItem[];

          const contract = new web3.eth.Contract(lendXContractAbiArray, contractAddress);
          const USDCContractAbiArray: AbiItem[] = USDCAbi as AbiItem[];
          const usdcContract = new web3.eth.Contract(USDCContractAbiArray, USDC_ADDRESS);

          const usdcAllowance = await usdcContract.methods.allowance(eAddress, contractAddress).call();

          console.log("usdcAllowance: " + usdcAllowance);
          // Check if the allowance is sufficient
          if (usdcAllowance < web3.utils.toWei(usdc.toString(), 'ether')) {

            toast.info(CustomToastWithLink({message: "Approving spending.", txid: ""}));
            // The allowance is insufficient, proceed with approval
            const approveTransaction = await ethereum.request({
              method: 'eth_sendTransaction',
              params: [{
                from: eAddress,
                to: USDC_ADDRESS,
                data: usdcContract.methods.approve(contractAddress, web3.utils.toWei(usdc.toString(), 'ether')).encodeABI(),
              }],
            });

            // Wait for the approval transaction receipt
            let approveReceipt = await web3.eth.getTransactionReceipt(approveTransaction);
            while (!approveReceipt || approveReceipt.status === undefined) {
              approveReceipt = await web3.eth.getTransactionReceipt(approveTransaction);
            }
            // Check if the approval transaction was successful
            if (approveReceipt && approveReceipt.status) {
              toast.success(CustomToastWithLink({message: "Spending approved.", txid: ""}));
              console.log('Approval transaction successful:', approveTransaction);
            } else {
              console.error('Approval transaction failed:', approveTransaction);
              // Handle the failure appropriately
              return;
            }
          } else {
            // The allowance is sufficient, no need for approval
            toast.error(CustomToastWithLink({message: "Sufficient allowance, no need for approval.", txid: ""}));
          }

          //await checkAndApproveAllowance(usdc);

          let data;
          let gas;

          try{
            // Proceed with the rest of your code
            data = contract.methods.repay(web3.utils.toWei(usdc.toString(), 'ether')).encodeABI();
            gas = await contract.methods.repay(web3.utils.toWei(usdc.toString(), 'ether')).estimateGas({ from: eAddress });

          } catch (e) {
            toast.error(CustomToastWithLink({message: "Error while getting gas value. Please try again later", txid: ""}));
            setTxid('');
            setError('');
          }
          
          const transactionObject = {
            from: eAddress,
            to: contractAddress,
            gas,
            data,
          };

          // Send the transaction using MetaMask
          const txid = await ethereum.request({
            method: 'eth_sendTransaction',
            params: [transactionObject],
          });

          // Add supply info to yourSupplies
          const supplyInfo = {
            walletAddress: address,
            poolId: borrow.poolid,
            apy: borrow.apy,
            amount: usdc,
            tx_id: txid,
          };

          // Make an HTTP request to add supply info to the database
          const response2 = new Promise((resolve, reject) => {
            axios.post(`${LENDX_API_BASE_URL}/api/addRepayInfo`, supplyInfo)
              .then(response => {
                resolve(response.data);
              })
              .catch(error => {
                reject(error);
              });
          });


          toast.promise(response2, {
            pending: "Submitting repay.",
            success: {render() {return CustomToastWithLink({message: "Repay submitted successfully. ", txid: txid})}},
            error: "Error submitting repay.",
          });


          // Set the transaction ID and clear any error
          setTxid('');
          setError('');

        } catch (e) {
          toast.error(CustomToastWithLink((e as any).message, ""));
          setTxid('');
          setError('');
        } 
      }
    };
  
    return (
      <div>
        <div style={{ textAlign: 'right' }}>
          <Input
            style={{ width: '101px' }}
            defaultValue={usdc}
            onChange={(e) => {
              setUSDC(parseFloat(e.target.value));
            }}
          ></Input>
          <Button className="supply-button" style={{ marginTop: 5, marginLeft: 10 }} onClick={handleSupply} disabled={loading}>
            {loading ? 'Loading...' : 'REPAY'}
          </Button>
            {error && <div style={{ color: 'red', marginTop: 5 }}>{error}</div>}
            {txid && (
            <div style={{ color: "green", marginTop: 5 }}>
            <a
              href={BLAST_SCAN_URL + txid}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'green', marginTop: 5, textDecoration: 'none' }}
            >
              {`${txid.substring(0, 5)}....${txid.substring(txid.length - 5)}`}
            </a>
          </div>
          )}
        </div>
      </div>
    );
  }
  export default App;

  
  // function SignPsbtCard() {
  //   const [psbtHex, setPsbtHex] = useState("");
  //   const [psbtResult, setPsbtResult] = useState("");
  //   return (
  //     <Card size="small" title="Sign Psbt" style={{ width: 300, margin: 10 }}>
  //       <div style={{ textAlign: "left", marginTop: 10 }}>
  //         <div style={{ fontWeight: "bold" }}>PsbtHex:</div>
  //         <Input
  //           defaultValue={psbtHex}
  //           onChange={(e) => {
  //             setPsbtHex(e.target.value);
  //           }}
  //         ></Input>
  //       </div>
  //       <div style={{ textAlign: "left", marginTop: 10 }}>
  //         <div style={{ fontWeight: "bold" }}>Result:</div>
  //         <div style={{ wordWrap: "break-word" }}>{psbtResult}</div>
  //       </div>
  //       <Button
  //         style={{ marginTop: 10 }}
  //         onClick={async () => {
  //           try {
  //             const psbtResult = await (window as any).unisat.signPsbt(psbtHex);
  //             setPsbtResult(psbtResult);
  //           } catch (e) {
  //             setPsbtResult((e as any).message);
  //           }
  //         }}
  //       >
  //         Sign Psbt
  //       </Button>
  //     </Card>
  //   );
  // }

  // function SignMessageCard() {
  //   const [message, setMessage] = useState("hello world~");
  //   const [signature, setSignature] = useState("");
  //   return (
  //     <Card size="small" title="Sign Message" style={{ width: 300, margin: 10 }}>
  //       <div style={{ textAlign: "left", marginTop: 10 }}>
  //         <div style={{ fontWeight: "bold" }}>Message:</div>
  //         <Input
  //           defaultValue={message}
  //           onChange={(e) => {
  //             setMessage(e.target.value);
  //           }}
  //         ></Input>
  //       </div>
  //       <div style={{ textAlign: "left", marginTop: 10 }}>
  //         <div style={{ fontWeight: "bold" }}>Signature:</div>
  //         <div style={{ wordWrap: "break-word" }}>{signature}</div>
  //       </div>
  //       <Button
  //         style={{ marginTop: 10 }}
  //         onClick={async () => {
  //           const signature = await (window as any).unisat.signMessage(message);
  //           setSignature(signature);
  //         }}
  //       >
  //         Sign Message
  //       </Button>
  //     </Card>
  //   );
  // }

  // function PushTxCard() {
  //   const [rawtx, setRawtx] = useState("");
  //   const [txid, setTxid] = useState("");
  //   return (
  //     <Card
  //       size="small"
  //       title="Push Transaction Hex"
  //       style={{ width: 300, margin: 10 }}
  //     >
  //       <div style={{ textAlign: "left", marginTop: 10 }}>
  //         <div style={{ fontWeight: "bold" }}>rawtx:</div>
  //         <Input
  //           defaultValue={rawtx}
  //           onChange={(e) => {
  //             setRawtx(e.target.value);
  //           }}
  //         ></Input>
  //       </div>
  //       <div style={{ textAlign: "left", marginTop: 10 }}>
  //         <div style={{ fontWeight: "bold" }}>txid:</div>
  //         <div style={{ wordWrap: "break-word" }}>{txid}</div>
  //       </div>
  //       <Button
  //         style={{ marginTop: 10 }}
  //         onClick={async () => {
  //           try {
  //             const txid = await (window as any).unisat.pushTx(rawtx);
  //             setTxid(txid);
  //           } catch (e) {
  //             setTxid((e as any).message);
  //           }
  //         }}
  //       >
  //         PushTx
  //       </Button>
  //     </Card>
  //   );
  // }

  // function PushPsbtCard() {
  //   const [psbtHex, setPsbtHex] = useState("");
  //   const [txid, setTxid] = useState("");
  //   return (
  //     <Card size="small" title="Push Psbt Hex" style={{ width: 300, margin: 10 }}>
  //       <div style={{ textAlign: "left", marginTop: 10 }}>
  //         <div style={{ fontWeight: "bold" }}>psbt hex:</div>
  //         <Input
  //           defaultValue={psbtHex}
  //           onChange={(e) => {
  //             setPsbtHex(e.target.value);
  //           }}
  //         ></Input>
  //       </div>
  //       <div style={{ textAlign: "left", marginTop: 10 }}>
  //         <div style={{ fontWeight: "bold" }}>txid:</div>
  //         <div style={{ wordWrap: "break-word" }}>{txid}</div>
  //       </div>
  //       <Button
  //         style={{ marginTop: 10 }}
  //         onClick={async () => {
  //           try {
  //             const txid = await (window as any).unisat.pushPsbt(psbtHex);
  //             setTxid(txid);
  //           } catch (e) {
  //             setTxid((e as any).message);
  //           }
  //         }}
  //       >
  //         pushPsbt
  //       </Button>
  //     </Card>
  //   );
  // }

  // function SendBitcoin({ currency, address  }: { currency: Currency; address: string  }) {
   
  //   const [satoshi, setSatoshi] = useState(0);
  //   const [txid, setTxid] = useState("");
  //   const [error, setError] = useState("");

  //   const handleSupply = async () => {
  //     if (satoshi < 3000){
  //       toast.error(CustomToastWithLink("Supply amount must be more than 0.00003 BTC.", ""));
  //     }
  //     else if (satoshi > (currency.myWalletBalance?currency.myWalletBalance : 0)){
  //         toast.error(CustomToastWithLink("Supply amount more then available amount.", ""));
  //     }else {

  //       try {
  //         const txid = await (window as any).unisat.sendBitcoin(
  //           poolWalletAddress,
  //           satoshi
  //         );

  //         // Add supply info to yourSupplies
  //         const supplyInfo = {
  //           walletAddress: address,
  //           poolId: currency.id,
  //           apy: currency.lend_apy,
  //           amount: satoshi,
  //           tx_id: txid,
  //         };

  //         // Make an HTTP request to add supply info to the database
  //         const response = new Promise((resolve, reject) => {
  //           axios.post(`${LENDX_API_BASE_URL}/api/addSupplyInfo`, supplyInfo)
  //             .then(response => {
  //               resolve(response.data);
  //             })
  //             .catch(error => {
  //               reject(error);
  //             });
  //         });

          
  //         toast.promise(response, {
  //           pending: "Submitting supply.",
  //           success: {render() {return CustomToastWithLink("Supply submitted successfully. ", txid)}},
  //           error: "Error submitting supply.",
  //         });
       
  //         setTxid("");
  //         setError("");
  //       } catch (e) {
  //         setTxid("");
  //         setError((e as any).message);
  //       }
  //     } 
  //   };

    
  //   return (
  //     <div>
  //       <div style={{ textAlign: "right"}}>
  //         <Input 
  //           style={{ width: "101px"}}
  //           defaultValue={satoshi}
  //           onChange={(e) => {
  //             setSatoshi(Math.round(parseFloat(e.target.value) * 100000000));
  //           }}
  //         ></Input>
  //         <Button className="supply-button"
  //         style={{ marginTop: 5, marginLeft: 10 }}
  //         onClick={handleSupply}
  //       >
  //         SUPPLY
  //       </Button>
  //       {error && <div style={{ color: "red", marginTop: 5 }}>{error}</div>}
  //       {txid && (
  //         <div style={{ color: "green", marginTop: 5 }}>
  //           <a
  //             href={MEMPOOL_URL + txid}
  //             target="_blank"
  //             rel="noopener noreferrer"
  //             style={{ color: 'green', marginTop: 5, textDecoration: 'none' }}
  //           >
  //             {`${txid.substring(0, 5)}....${txid.substring(txid.length - 5)}`}
  //           </a>
  //         </div>
  //       )}

  //       </div>
  //     {/*   <div style={{ textAlign: "left", marginTop: 10 }}>
  //         <div style={{ fontWeight: "bold" }}>txid:</div>
  //         <div style={{ wordWrap: "break-word" }}>{txid}</div>
  //       </div> */}
        
  //     </div>
  //   );
  // }

