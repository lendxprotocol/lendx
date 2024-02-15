import React from 'react';
import * as dotenv from 'dotenv';
dotenv.config();


const BLAST_SCAN_URL = process.env.REACT_APP_BLAST_SCAN_URL;
const MEMPOOL_URL = process.env.REACT_APP_MEMPOOL_URL;
  

const CustomToastWithLink: React.FC<{ message: string, txid: string }> = ({ message, txid }) => (
  <div>
    <div>{message}</div>

    {txid !== "" && (
      <div>
        <a href={`${txid.startsWith("0x") ? BLAST_SCAN_URL : MEMPOOL_URL}${txid}`} target="_blank" rel="noopener noreferrer">
          View Transaction: {`${txid.substring(0, 5)}...${txid.substring(txid.length - 5)}`}
        </a>
      </div>
    )}
  </div>
);

export default CustomToastWithLink;
