import React, { useState } from "react";
import { Switch } from "antd";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import CustomToastWithLink from './CustomToast';
import { Button, Input } from "antd";
import axios from "axios";

import { Supply, TransactionInput, Output } from '../interfaces'; // <-- Add the .ts extension
import * as dotenv from 'dotenv';

dotenv.config();

const LENDX_API_BASE_URL = process.env.REACT_APP_LENDX_API_BASE_URL;
const MEMPOOL_URL = process.env.REACT_APP_MEMPOOL_URL;  

const renderYourSupplyTableRows = (yourSuppliesData: Supply[], status: any, address: string) => {
  return yourSuppliesData.map((supply: Supply) => (
    <tr key={supply.id}>
      <th>
        <img
          src={`${supply.symbol}.png`}
          alt={`${supply.symbol}-logo`}
          style={{ height: "25px", marginRight: "10px" }}
        />
        {supply.symbol}
      </th>
      
      <th>{(supply.amount ? supply.amount / 100000000 : 0).toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 })}
      <div className="supply-value">
        {supply.value !== undefined ? `$${supply.value.toFixed(2)}` : 'N/A'}
      </div>
      </th>

      <th>{supply.apy}</th>
      
      <th>  <Switch
      checked={true}
    /></th>
    <th>
      
      
      {(
        supply.accrued_interest
          ?  (Math.trunc(supply.accrued_interest) / 100000000).toFixed(8)
          : "0.00000000"
      )}
      <br />
      <div className="supply-value">
        {supply.accrued_interest_value !== undefined ? `$${supply.accrued_interest_value.toFixed(4)}` : 'N/A'}
      </div>
    </th>


      <th style={{width: "100px", textAlign: "right"}}>
      <div className="supply-value">
        Max({supply.max_withdrawal = parseFloat(((status?.netWorth? status.netWorth: 0) / (supply.value?supply.value/(supply.amount?supply.amount/100000000:0) : 0)).toFixed(8))})
        </div><WithdrawBitcoin supply={supply} address={address}/>
      </th>
    </tr>
  ));
};

function WithdrawBitcoin({ supply, address  }: { supply: Supply; address: string  }) {
    
  const [satoshi, setSatoshi] = useState(0);
  const [txid, setTxid] = useState("");
  const [error, setError] = useState("");
  
  const handleWithdraw = async () => {

    if (satoshi < 3000)
    {
      toast.error(CustomToastWithLink({message: "Withdraw amount must be more than 0.00003 BTC.", txid: ""}));
    }else if (satoshi > supply.max_withdrawal*100000000){
      toast.error(CustomToastWithLink({message: "Withdraw amount more then " + supply.max_withdrawal +" BTC.", txid: ""}));
    }else {
      
    try {
      // Call the Node.js API to get the partial transaction hex and server-signed transaction
      const response = await axios.post(`${LENDX_API_BASE_URL}/api/withdrawYourSupplyRequest`, {
        walletAddress: address,
        poolId: supply.poolid,
        amount: satoshi,
      });

      const { partialTransaction, fee, serverSignedHash } = response.data;

      // Prompt the user to sign the partially signed transaction
      // (Use the signing method provided by your wallet library)

   
      console.log('partialTransaction:', partialTransaction);
   
      let htmlString = `
        version: ${partialTransaction.version}
        locktime: ${partialTransaction.locktime}
      `;

      // Display information for each input
      partialTransaction.ins.forEach((input: TransactionInput, index: number) => {
        htmlString += `
          ins[${index + 1}]:
            hash: ${input.hash.toString()}
            index: ${input.index}
            script: ${input.script.data.toString()}
            sequence: ${input.sequence}
            witness: ${JSON.stringify(input.witness)}
        `;
      });

      // Display information for each output
      partialTransaction.outs.forEach((output: Output, index: number) => {
        htmlString += `
          outs[${index + 1}]:
            script: ${output.script.data.toString()}
            value: ${output.value}
        `;
      });

      htmlString += `Fee: ${fee}`;

      // Output the HTML string
      console.log(htmlString);
      
      const signature = await (window as any).unisat.signMessage(htmlString);
      const publicKey = await (window as any).unisat.getPublicKey();

      const txid = await (window as any).unisat.pushTx(serverSignedHash);
      
      setTxid("");
      
      const response1 = new Promise(async (resolve, reject) => {
        try {
          const response = await axios.post(`${LENDX_API_BASE_URL}/api/withdrawYourSupplyCommit`, {
            transactionHash: serverSignedHash,
            signature: signature,
            publicKey: publicKey,
            walletAddress: address,
            poolId: supply.poolid,
            apy: supply.apy,
            amount: 0 - satoshi,
            tx_id: txid,
          });
    
          resolve(response.data);
        } catch (error) {
          toast.error(CustomToastWithLink({message: "Error: " + error, txid: ""}));
          reject(error);
        }
      });

      toast.promise(response1, {
        pending: "Submitting withdrawal.",
        success: {render() {return CustomToastWithLink({message: "Withdrawal submitted successfully. ", txid: txid})}},
        error: "Error submitting withdrawal.",
      });
        
      setTxid("");
      setError("");
    } catch (e) {
      toast.error(CustomToastWithLink((e as any).message, ""));
      setTxid("");
    }}
    
  };
  
  return (
    <div >
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
        onClick={handleWithdraw}
      >
        WITHDRAW
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
    {/*   <div style={{ textAlign: "left", marginTop: 10 }}>
        <div style={{ fontWeight: "bold" }}>txid:</div>
        <div style={{ wordWrap: "break-word" }}>{txid}</div>
      </div> */}
      
    </div>
  );
}

export default renderYourSupplyTableRows;
