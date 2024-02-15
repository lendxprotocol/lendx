import React, { useState } from "react";
import { Currency } from '../interfaces'; // Import your types
import { toast } from 'react-toastify';
import CustomToastWithLink from './CustomToast';
import { Button, Input } from "antd";
import axios from "axios";
import 'react-toastify/dist/ReactToastify.css';
import * as dotenv from 'dotenv';
dotenv.config();

const poolWalletAddress = process.env.REACT_APP_POOL_WALLET_ADDRESS;
const LENDX_API_BASE_URL = process.env.REACT_APP_LENDX_API_BASE_URL;
const MEMPOOL_URL = process.env.REACT_APP_MEMPOOL_URL;  

export const renderSupplyTableRows = (
  currencyData: Currency[],
  connected: boolean,
  address: string
) => {
  return currencyData.map((currency: Currency) => {
    if (currency.allowlending) {
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
              <th>{(currency.value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 20 })}</th>
            
              {connected && (
                <th>{(currency.myWalletBalance ? currency.myWalletBalance / 100000000 : 0).toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 })}</th>
              )}
              
              <th>{currency.lend_apy}</th>

              <th style={{width: "100px"}}>
                {connected ? (
                <div><SendBitcoin currency={currency} address={address}/></div>
                ) : (

                <div></div>
                
                )}
                
              </th>
            </tr>
      );
    } else {
      return null;
    }
  });
};

function SendBitcoin({ currency, address  }: { currency: Currency; address: string  }) {
   
    const [satoshi, setSatoshi] = useState(0);
    const [txid, setTxid] = useState("");
    const [error, setError] = useState("");

    const handleSupply = async () => {
      if (satoshi < 3000){
        toast.error(CustomToastWithLink({message: "Supply amount must be more than 0.00003 BTC.", txid: ""}));
      }
      else if (satoshi > (currency.myWalletBalance?currency.myWalletBalance : 0)){
          toast.error(CustomToastWithLink({message: "Supply amount more then available amount.", txid: ""}));
      }else {

        try {
          const txid = await (window as any).unisat.sendBitcoin(
            poolWalletAddress,
            satoshi
          );

          // Add supply info to yourSupplies
          const supplyInfo = {
            walletAddress: address,
            poolId: currency.id,
            apy: currency.lend_apy,
            amount: satoshi,
            tx_id: txid,
          };

          // Make an HTTP request to add supply info to the database
          const response = new Promise((resolve, reject) => {
            axios.post(`${LENDX_API_BASE_URL}/api/addSupplyInfo`, supplyInfo)
              .then(response => {
                resolve(response.data);
              })
              .catch(error => {
                reject(error);
              });
          });

          
          toast.promise(response, {
            pending: "Submitting supply.",
            success: {render() {return CustomToastWithLink({message: "Supply submitted successfully.", txid: txid})}},
            error: "Error submitting supply.",
          });
       
          setTxid("");
          setError("");
        } catch (e) {
          setTxid("");
          setError((e as any).message);
        }
      } 
    };

    
    return (
      <div>
        <div style={{ textAlign: "right"}}>
          <Input 
            style={{ width: "101px"}}
            defaultValue={satoshi}
            onChange={(e) => {
              setSatoshi(Math.round(parseFloat(e.target.value) * 100000000));
            }}
          ></Input>
          <Button className="supply-button"
          style={{ marginTop: 5, marginLeft: 10 }}
          onClick={handleSupply}
        >
          SUPPLY
        </Button>
        {error && <div style={{ color: "red", marginTop: 5 }}>{error}</div>}
        {txid && (
          <div style={{ color: "green", marginTop: 5 }}>
            <a
              href={MEMPOOL_URL + txid}
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

