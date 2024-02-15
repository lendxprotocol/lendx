const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');
const bitcoin = require('bitcoinjs-lib')
const app = express();
const port = 3002;
const dotenv = require('dotenv');
const Web3=require('web3');
const { toWei } = require('web3').utils;
const LendXAbi = require('../src/abi/Lendx.json'); 

dotenv.config(); // Load environment variables from .env file

console.log(process.env.LENDX_DB_USER);
// Enable CORS for all routes
app.use(cors());
app.use(express.json());


const pool = new Pool({
  user: process.env.LENDX_DB_USER,
  host: process.env.LENDX_DB_HOST,
  database: process.env.LENDX_DB_DATABASE,
  password: process.env.LENDX_DB_PASSWORD,
  port: parseInt(process.env.LENDX_DB_PORT, 10),
});

const serverAddress = process.env.LENDX_SERVER_ADDRESS;
const serverWIF = process.env.LENDX_SERVER_WIF;
const web3 = new Web3('https://sepolia.blast.io');
const contractAddress = '0x198cdf01c26894255538acb43408dd94d83bdc5f';
// ERC-20 token contract address (USDC)
const tokenAddress = '0x29F9024162fb03E0eb1bD7e346e8147d0331bDBb';
const privateKey = process.env.LENDX_PK; // Make sure to set PK in your .env file
const collateralFactor = 0.8;
const borrowFactor = 1.0;
// Array to store poolid and value
let poolDataArray = [];

// Run the script every 2 seconds
setInterval(processPendingTransactions, 2000);
setInterval(checkLiquidation, 1000);


// Function to fetch pending supply transactions from transactionHistory
async function getPendingTransactions() {
  const query = `
    SELECT * FROM TRANSACTIONHISTORY
    WHERE status = 'pending';
  `;

  const { rows } = await pool.query(query);
  // Log the number of pending transactions
  console.log(`Number of pending transactions: ${rows.length}`);

  return rows;
}

// Function to check transaction status in Bitcoin mempool
async function checkBitcoinTransactionStatus(txId) {
  try {
    const response = await axios.get(`https://mempool.space/testnet/api/tx/${txId}`);
    
    const data = response.data;

    if (data && data.status && data.status.confirmed === true) {
      return true; // Transaction is confirmed
    } else {
      return false; // Transaction is not confirmed or status information not available
    }
  } catch (error) {
    console.error('Error checking transaction status:', error.message);
    return false;
  }
}

async function checkEthereumTransactionStatus(txHash) {
  try {
    // Get transaction receipt
    const receipt = await web3.eth.getTransactionReceipt(txHash);

    // Check if the transaction is included in a block (confirmed)
    if (receipt && receipt.blockNumber) {
      // Transaction is confirmed
      return true;
    } else {
      // Transaction is not yet confirmed
      return false;
    }
  } catch (error) {
    // Handle error (e.g., log it)
    console.error('Error checking Ethereum transaction status:', error.message);
    throw error; // Propagate the error
  }
}

async function updateAllInterestRate(apy, pool_id) {
  const client = await pool.connect(); // Acquiring a client from the pool

  try {
    await client.query('BEGIN'); // Start the transaction

    // Your first update query for YOURSUPPLIES
    const updateQuery1 = `
      UPDATE YOURSUPPLIES
      SET
        apy = $1::float,
        accrued_interest = accrued_interest + amount * (POWER((1 + $1 / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated_datetime)) / 60 / 60 / 24 / 365.25) - 1),
        last_updated_datetime = CURRENT_TIMESTAMP
      WHERE poolid = $2;
    `;
    await client.query(updateQuery1, [apy, pool_id]);

    // Your second update query for availablePool
    const updateQuery2 = `
      UPDATE availablePool
      SET
        lend_apy = $1::float
      WHERE id = $2;
    `;
    await client.query(updateQuery2, [apy, pool_id]);

    await client.query('COMMIT'); // Commit the transaction

    console.log('Interest rates updated successfully.');
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback the transaction in case of an error

    console.error('Error updating interest rates:', error.message);
    throw error;
  } 
  
}


async function updateAllBorrowRate(apy, pool_id) {
  const client = await pool.connect(); // Acquiring a client from the pool

  try {
    await client.query('BEGIN'); // Start the transaction

    // Your first update query for YOURSUPPLIES
    const updateQuery1 = `
      UPDATE YOURBORROW
      SET
        apy = $1::float,
        accrued_interest = accrued_interest + amount * (POWER((1 + $1 / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated_datetime)) / 60 / 60 / 24 / 365.25) - 1),
        last_updated_datetime = CURRENT_TIMESTAMP
      WHERE poolid = $2;
    `;
    await client.query(updateQuery1, [apy, pool_id]);

    // Your second update query for availablePool
    const updateQuery2 = `
      UPDATE availablePool
      SET
        borrow_apy = $1::float
      WHERE id = $2;
    `;
    await client.query(updateQuery2, [apy, pool_id]);

    await client.query('COMMIT'); // Commit the transaction

    console.log('Interest rates updated successfully.');
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback the transaction in case of an error

    console.error('Error updating interest rates:', error.message);
    throw error;
  } 
}

// Function to update yourSupplies table
async function updateYourSupplies(row) {
  const { pool_id, wallet_address, amount, apy } = row;

  // Check if the record already exists
  const checkQuery = `
    SELECT * FROM yourSupplies
    WHERE walletaddress = $1 AND poolid = $2;
  `;

  const checkResult = await pool.query(checkQuery, [wallet_address, pool_id]);

  if (checkResult.rows.length > 0) {
    // If the record exists, update it
    const updateQuery = `
      UPDATE yourSupplies
      SET amount = FLOOR(amount + accrued_interest + (amount * (POWER((1 + apy / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated_datetime)) / 60 / 60 / 24 / 365.25)) - amount) + $1),
          last_updated_datetime = CURRENT_TIMESTAMP,
          apy = apy,
          accrued_interest = 0 
            
      WHERE walletaddress = $2 AND poolid = $3;
    `;

    await pool.query(updateQuery, [amount, wallet_address, pool_id]);
  } else {
    // If the record doesn't exist, insert it
    const insertQuery = `
      INSERT INTO yourSupplies (poolid, walletaddress, amount, apy, supplied_datetime, last_updated_datetime, accrued_interest)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0);
    `;

    await pool.query(insertQuery, [pool_id, wallet_address, amount, apy]);
  }
}


// Function to update yourSupplies table
async function updateYourBorrow(row) {
  const { pool_id, wallet_address, amount, apy } = row;

  
  // Check if the record already exists
  const checkQuery = `
    SELECT * FROM yourBorrow
    WHERE walletaddress = $1 AND poolid = $2;
  `;

  const checkResult = await pool.query(checkQuery, [wallet_address, pool_id]);

  if (checkResult.rows.length > 0) {
    // If the record exists, update it
    const updateQuery = `
      UPDATE yourBorrow
      SET amount = amount - accrued_interest - (amount * (POWER((1 + apy / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated_datetime)) / 60 / 60 / 24 / 365.25)) - amount) + $1,
          last_updated_datetime = CURRENT_TIMESTAMP,
          apy = apy,
          accrued_interest = 0
            
      WHERE walletaddress = $2 AND poolid = $3;
    `;

    await pool.query(updateQuery, [amount * -1, wallet_address, pool_id]);
  } else {
    // If the record doesn't exist, insert it
    const insertQuery = `
      INSERT INTO yourBorrow (poolid, walletaddress, amount, apy, borrowed_datetime, last_updated_datetime, accrued_interest)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0);
    `;

    await pool.query(insertQuery, [pool_id, wallet_address, amount * -1, apy]);
  }
}


// Main function to process pending transactions
async function processPendingTransactions() {
  try {
    const pendingTransactions = await getPendingTransactions();

    for (const transaction of pendingTransactions) {
      const { id, tx_id, transaction_type, pool_id, apy } = transaction;

      try {
        // Check transaction status in Bitcoin mempool
        let isConfirmed;

        if (tx_id.startsWith('0x')) {
          console.log("Pending Ethereum transaction found. " + tx_id);
          // Ethereum transaction, call Ethereum status check function
          isConfirmed = await checkEthereumTransactionStatus(tx_id);
        } else {
          // Bitcoin transaction, call Bitcoin status check function
          isConfirmed = await checkBitcoinTransactionStatus(tx_id);
        }

        if (isConfirmed) {

          console.log("transaction: " + transaction);
          console.log("transaction_type: " + transaction_type);

          if (transaction_type === 'Supply' || transaction_type === 'Withdrawal'){
            // Update yourSupplies table if the transaction is confirmed
            await updateYourSupplies(transaction);
            const newInterestRate = 5.50;
            if (newInterestRate !== apy)
            {
              await updateAllInterestRate(newInterestRate, pool_id);
            }

          }else if (transaction_type === 'Borrow' || transaction_type === 'Repay'){
            // Update yourSupplies table if the transaction is confirmed
            await updateYourBorrow(transaction);

            const newBorrowRate = 6.8;
            if (newBorrowRate !== apy)
            {
              await updateAllBorrowRate(newBorrowRate, pool_id);
            }
            
          }
          
          // Update transactionHistory status to 'confirmed'
          await pool.query('UPDATE transactionHistory SET status = $1 WHERE id = $2', ['confirmed', id]);

          //Calculate Interest rate for the pool and update the whole database with
          // New interest-rate
          // accrued_interest + amount * (POWER((1 + ys.apy / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated_datetime)) / 60 / 60 / 24 / 365.25)) - ys.amount) AS accrued_interest,
          // last_updated_datetime = CURRENT_TIMESTAMP
        
        }
      } catch (statusCheckError) {
        console.error('Error checking transaction status:', statusCheckError.message);
        // Optionally, you can handle the error by updating the status to 'error' or logging it
        await pool.query('UPDATE transactionHistory SET status = $1 WHERE id = $2', ['error', id]);
      }
    }
  } catch (error) {
    console.error('Error processing pending supply transactions:', error.message);
  }
}


// Function to populate poolDataArray
async function populatePoolDataArray() {
  try {
    const client = await pool.connect();

    // Fetch available pool data from the database
    const result = await client.query('SELECT * FROM availablePool');
    const poolData = result.rows;

    // Extract Coingecko symbols from the database data
    const symbols = poolData.map((currency) => currency.coingecko.toLowerCase()).join('","');

    // Fetch prices from Binance API
    const binanceResponse = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbols=["${symbols.toUpperCase()}"]`
    );

    const binancePrices = binanceResponse.data;

    // Reset array before populating
    poolDataArray = [];

    // Add 'poolid' and 'value' properties to each currency in the response data
    const dataWithValues = poolData.map((currency) => {
      const binanceSymbol = currency.coingecko.toUpperCase();
      const binancePrice = binancePrices.find(item => item.symbol === binanceSymbol)?.price;

      const parsedBinancePrice = binancePrice ? parseFloat(binancePrice) : 0;

      // Log a message if binancePrice is not found
      if (!binancePrice) {
        console.warn(`Binance price not found for symbol: ${binanceSymbol}`);
      }

      // Store 'poolid' and 'value' in the array
      poolDataArray.push({
        poolid: currency.id,
        value: parsedBinancePrice,
      });

      return {
        ...currency,
        value: parsedBinancePrice,
      };
    });

    client.release();

    // Sort dataWithValues array by the 'enabled' property first and then by the 'value' property
    const sortedData = dataWithValues.sort((a, b) => {
      // First, sort by 'enabled' property (true comes first)
      if (a.enabled && !b.enabled) {
        return -1;
      } else if (!a.enabled && b.enabled) {
        return 1;
      }

      // If 'enabled' properties are the same, then sort by 'value' property
      return b.value - a.value;
    });

    // Log the sorted data for debugging
    // console.log('Sorted Data:', sortedData);

    // Send the response with the sorted data
    return sortedData;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
}

app.get('/api/getPool', async (req, res) => {
  try {
    const sortedData = await populatePoolDataArray();
    res.json(sortedData);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/addSupplyInfo', async (req, res) => {
  try {
    const { walletAddress, poolId, apy, amount, tx_id } = req.body;

    if (!walletAddress || !poolId || !apy || !amount || !tx_id) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Assuming you have a table named "transactionHistory"
    const queryInsertTransactionHistory = `
      INSERT INTO transactionHistory (pool_id, transaction_type, wallet_address, amount, apy, tx_id, status, datetime)
      VALUES ($1, 'Supply', $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
    `;

    // Assuming you have a connection pool named "pool"
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert into transactionHistory
      await client.query(queryInsertTransactionHistory, [poolId, walletAddress, amount, apy, tx_id]);

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error adding supply info:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error adding supply info:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/addBorrowInfo', async (req, res) => {
  try {
    const { walletAddress, poolId, apy, amount, tx_id } = req.body;

    if (!walletAddress || !poolId || !apy || !amount || !tx_id) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Assuming you have a table named "transactionHistory"
    const queryInsertTransactionHistory = `
      INSERT INTO transactionHistory (pool_id, transaction_type, wallet_address, amount, apy, tx_id, status, datetime)
      VALUES ($1, 'Borrow', $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
    `;

    // Assuming you have a connection pool named "pool"
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert into transactionHistory
      await client.query(queryInsertTransactionHistory, [poolId, walletAddress, amount, apy, tx_id]);

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error adding borrow info:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error adding supply info:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.post('/api/addRepayInfo', async (req, res) => {
  try {
    const { walletAddress, poolId, apy, amount, tx_id } = req.body;

    if (!walletAddress || !poolId || !apy || !amount || !tx_id) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Assuming you have a table named "transactionHistory"
    const queryInsertTransactionHistory = `
      INSERT INTO transactionHistory (pool_id, transaction_type, wallet_address, amount, apy, tx_id, status, datetime)
      VALUES ($1, 'Repay', $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
    `;

    // Assuming you have a connection pool named "pool"
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert into transactionHistory
      await client.query(queryInsertTransactionHistory, [poolId, walletAddress, amount, apy, tx_id]);

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error adding repay info:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error adding repay info:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

  

  app.get('/api/getYourSupply', async (req, res) => {
    try {
      const { wallet_address } = req.query;
      //console.log(wallet_address);
      if (!wallet_address) {
        return res.status(400).json({ error: 'Missing wallet_address parameter' });
      }
  
      // Assuming you have a table named "yourSupplies" and "availablePool"
      const query = `
        SELECT
          ys.id,
          ys.poolid,
          ys.walletaddress,
          ys.amount,
          ys.apy,
          ys.collateral,
          ys.supplied_datetime,
          ys.last_updated_datetime,
          ys.accrued_interest + 
            (ys.amount * (POWER((1 + ys.apy / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ys.last_updated_datetime)) / 60 / 60 / 24 / 365.25)) - ys.amount) AS accrued_interest,
        
          ap.symbol,
          ap.coingecko,
          ap.unisat
        FROM
          yourSupplies ys
        JOIN
          availablePool ap ON ys.poolid = ap.id
        WHERE
          ys.walletaddress = $1
      `;
  
      const result = await pool.query(query, [wallet_address]);
      //console.log(result.rows);
      res.json(result.rows);
    } catch (error) {
      console.error('Error getting your supplies:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/getYourBorrow', async (req, res) => {
    try {
      const { wallet_address } = req.query;
  
      if (!wallet_address) {
        return res.status(400).json({ error: 'Missing wallet_address parameter' });
      }
      
  
      // Assuming you have a table named "yourSupplies" and "availablePool"
      const query = `
        SELECT
        yb.id,
        yb.poolid,
        yb.walletaddress,
        yb.amount,
        yb.apy,
        yb.collateral,
        yb.borrowed_datetime,
        yb.last_updated_datetime,
        yb.accrued_interest + 
            (yb.amount * (POWER((1 + yb.apy / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - yb.last_updated_datetime)) / 60 / 60 / 24 / 365.25)) - yb.amount) AS accrued_interest,
        
          ap.symbol,
          ap.coingecko,
          ap.unisat
        FROM
          yourBorrow yb
        JOIN
          availablePool ap ON yb.poolid = ap.id
        WHERE
        yb.walletaddress = $1
      `;
  
      const result = await pool.query(query, [wallet_address]);
  
      res.json(result.rows);
    } catch (error) {
      console.error('Error getting your borrow:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  const fetchUTXOs = async (address) => {
    const url = `https://mempool.space/testnet/api/address/${address}/utxo`; 
    console.log(url);
    const response = await axios.get(url);
    return response.data;
  };

  const getFeeRate = async () => {
    const response = await axios.get('https://mempool.space/testnet/api/v1/fees/recommended');
    return response.data.fastestFee+1; // You can use 'fastestFee', 'halfHourFee', or 'hourFee'
  };

  app.post('/api/withdrawYourSupplyRequest', async (req, res) => {

    const { walletAddress, poolId, amount } = req.body;
    let partialTransaction = "";
    let fee = 0;
    let testnet = bitcoin.networks.testnet;
    let txb = new bitcoin.TransactionBuilder(testnet);

    console.log('walletAddress: ' + walletAddress);
    console.log('poolId: ' + poolId);
    console.log('amount: ' + amount);

    const balanceQuery = `
  SELECT
   
      yoursupplies.AMOUNT::double precision +
      FLOOR(yoursupplies.accrued_interest) +
      FLOOR(
        yoursupplies.amount * POWER((1 + yoursupplies.apy / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated_datetime)) / 60 / 60 / 24 / 365.25) - yoursupplies.amount
      ) +
      COALESCE(filteredHistory.amount, 0)
    AS balance
  FROM yoursupplies
  LEFT JOIN (
    SELECT wallet_address, pool_id, amount
    FROM transactionhistory
    WHERE transaction_type = 'Withdrawal' AND status = 'pending'
  ) AS filteredHistory
  ON yoursupplies.walletaddress = filteredHistory.wallet_address
    AND yoursupplies.poolid = filteredHistory.pool_id
  WHERE yoursupplies.walletaddress = $1
    AND yoursupplies.poolid = $2;
`;

    // Execute the query using the connection pool
    const { rows } = await pool.query(balanceQuery, [walletAddress, poolId]);

    if (rows.length === 0) {
      console.log('No balance found for the provided conditions.');
      return;
    }

    const balance = rows[0].balance;

    console.log("balance: " + balance);

    // Check if the balance is greater than the request amount
    if (balance >= amount) {
      console.log('Balance is sufficient for the request.');

      const feeRate = await getFeeRate();
      const utxos = await fetchUTXOs(serverAddress);
      let serverBalance = 0; 
      for (const transaction of utxos) {
        console.log(transaction.txid, transaction.vout, transaction.value);
        txb.addInput(transaction.txid, transaction.vout);
        serverBalance += transaction.value;
      }

      // Calculate the fee based on the estimated transaction size
      const estimatedSize = txb.buildIncomplete().toBuffer().length;
      fee = Math.ceil((estimatedSize + 300) * feeRate);

      console.log("Receive amount: " + amount-fee);

      txb.addOutput(walletAddress, amount-fee);

      console.log("Return amount: " + serverBalance-amount);
      //return address
      txb.addOutput(serverAddress, serverBalance-amount);

      let keypairSpend = bitcoin.ECPair.fromWIF(serverWIF, testnet);

      // Sign each input
      for (let i = 0; i < utxos.length; i++) {
        console.log(i);
        txb.sign(i, keypairSpend);
      }

      let tx = txb.buildIncomplete();
      let txhex = tx.toHex();
      partialTransaction = tx;
      console.log(txhex);
      
      console.log(txhex);
      const serverSignedHash = txhex;
    
      res.json({ partialTransaction, fee,  serverSignedHash});
      
    } else {
      console.log('Insufficient balance for the request.');
      res.status(500).json({ error: 'Insufficient balance for the request.' });
    }

    
  });

  app.post('/api/withdrawYourSupplyCommit', async (req, res) => {
    try {
      const { walletAddress, apy, poolId, amount, tx_id } = req.body;
  
      if (!walletAddress || !poolId || !apy || !amount || !tx_id) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      console.log("walletAddress: " + walletAddress);
      console.log("poolId: " + poolId);
      console.log("apy: " + apy);
      console.log("amount: " + amount);
      console.log("tx_id: " + tx_id);
  
      // Assuming you have a table named "transactionHistory"
      const queryInsertTransactionHistory = `
        INSERT INTO transactionHistory (pool_id, transaction_type, wallet_address, amount, apy, tx_id, status, datetime)
        VALUES ($1, 'Withdrawal', $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
      `;
  
      // Assuming you have a connection pool named "pool"
      const client = await pool.connect();
  
      try {
        await client.query('BEGIN');
  
        // Insert into transactionHistory
        await client.query(queryInsertTransactionHistory, [poolId, walletAddress, amount, apy, tx_id]);
  
        await client.query('COMMIT');
        res.json({ success: true });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error withdrawing supply info:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error withdrawing supply info:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
    
  });

  app.get('/api/getTransactionHistory', async (req, res) => {
    try {
      const walletAddress = req.query.wallet_address;
      //console.log(walletAddress);
      // Perform any necessary validation on walletAddress
  
      const query = `
        SELECT transactionHistory.id, pool_id, transaction_type, amount, apy, tx_id, status, datetime, wallet_address, symbol
        FROM transactionHistory INNER JOIN availablePool on transactionHistory.pool_id = availablePool.id
        WHERE wallet_address = $1
        ORDER BY datetime DESC;
      `;
  
      const { rows } = await pool.query(query, [walletAddress]);
      //console.log(rows);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  });

  app.get('/api/getPendingTransactions', async (req, res) => {
    try {
      const walletAddress = req.query.wallet_address;
      //console.log(walletAddress);
      // Perform any necessary validation on walletAddress
  
      const query = `
        SELECT * 
        FROM transactionHistory 
        WHERE wallet_address = $1 and status='pending' 
        ORDER BY datetime DESC;
      `;
  
      const { rows } = await pool.query(query, [walletAddress]);
      //console.log(rows);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  });

  // ... (previous code)

app.get('/api/getPendingMessages', async (req, res) => {
  try {
    const walletAddress = req.query.wallet_address;

    // Perform any necessary validation on walletAddress
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }

    const query = `
      SELECT count(id)
      FROM transactionHistory
      WHERE wallet_address = $1 AND status = 'pending';
    `;

    const { rows } = await pool.query(query, [walletAddress]);
    const pendingMessagesCount = rows[0].count;

    res.json({ success: true, count: pendingMessagesCount });
  } catch (error) {
    console.error('Error fetching pending messages count:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.get('/api/test', async (req, res) => {
  

  console.log(process.env.NODE_PATH);
  console.log(Web3.version);
  
  
  // ERC-20 ABI (standard interface for ERC-20 contracts)
  const erc20Abi = [
    {
      constant: true,
      inputs: [{ name: '_owner', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: 'balance', type: 'uint256' }],
      type: 'function',
    },
  ];
  
  const contract = new web3.eth.Contract(erc20Abi, tokenAddress);
  let balanceUSDC  = 0.0;
  // Get the balance of USDC in the contract
  contract.methods.balanceOf(contractAddress).call()
    .then(balance => {
      
      balanceUSDC = balance/1e18;
      console.log(`Balance of USDC in the contract: ${balanceUSDC}`);
      res.json({ success: true, result: balanceUSDC });

    })

    .catch(error => {
      console.error('Error:', error);
    });
    
    
  
});


const updateAllowedToBorrowAmount = async (walletAddress, maxAmount) => {
  try {
    console.log("updateAllowedToBorrowAmount");
    // Create a new web3 instance with the private key
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);
    web3.eth.defaultAccount = account.address;
    console.log("account.address: " + account.address);
    // Load the Ethereum contract
    const contract = new web3.eth.Contract(LendXAbi, contractAddress);

    // Estimate gas required for the transaction
    const gasEstimate = await contract.methods.updateAllowedToBorrowAmount(walletAddress, maxAmount).estimateGas();

    // Build the transaction data
    const txData = contract.methods.updateAllowedToBorrowAmount(walletAddress, maxAmount).encodeABI();

    // Build the transaction object
    const transactionObject = {
      from: account.address,
      to: contractAddress,
      gas: gasEstimate,
      data: txData,
    };

    // Sign and send the transaction
    const signedTransaction = await web3.eth.accounts.signTransaction(transactionObject, privateKey);
    const receipt = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
    // Wait for the transaction to be confirmed
    await waitForConfirmation(receipt.transactionHash);

    console.log('Successfully updated allowed to borrow amount. Transaction hash:', receipt.transactionHash);
  } catch (error) {
    console.error('Error updating allowed to borrow amount:', error);
  }
};

const waitForConfirmation = async (txHash, confirmations = 2) => {
  
  // Poll for confirmation
  let receipt;
  while (confirmations > 0) {
    receipt = await web3.eth.getTransactionReceipt(txHash);

    if (receipt && receipt.blockNumber) {
      confirmations--;
    }

    await delay(5000); // Poll every 5 seconds
  }

  // Check if transaction is confirmed
  if (confirmations === 0) {
    console.log('Transaction confirmed:', txHash);
  } else {
    console.log('Transaction not confirmed within expected time.');
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


app.post('/api/updateAllowToBorrow', async (req, res) => {
  try {
    const { walletAddress, maxAmount, amount } = req.body;

    if (!walletAddress || !maxAmount || !amount) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log('walletAddress: ' + walletAddress);
    console.log('maxAmount: ' + maxAmount);
    console.log('amount: ' + amount);

    // Call the updateAllowedToBorrowAmount function
    await updateAllowedToBorrowAmount(walletAddress, toWei(maxAmount.toString()));

    res.json({ message: 'Successfully updated allowed to borrow amount' });
  } catch (error) {
    console.error('Error updating ethereum contract:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function checkLiquidation() {
  const query = `
  SELECT
    yoursupplies.walletaddress,
    yoursupplies.poolid AS supplied_poolid,
    yoursupplies.amount + 
  yoursupplies.accrued_interest + 
  (yoursupplies.amount * 
    (POWER
      (
        (1 + yoursupplies.apy / 100), 
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - yoursupplies.last_updated_datetime)) / 60 / 60 / 24 / 365.25
      )
    ) - yoursupplies.amount
  ) AS supplied_amount,
    yoursupplies.apy AS supplied_apy,
    yourborrow.poolid AS borrowed_poolid,
    yourborrow.amount - 
  yourborrow.accrued_interest - 
  (yourborrow.amount * 
    (POWER
      (
        (1 + yourborrow.apy / 100), 
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - yourborrow.last_updated_datetime)) / 60 / 60 / 24 / 365.25
      )
    ) - yourborrow.amount
  ) AS borrowed_amount,
    yourborrow.apy AS borrowed_apy
  FROM
    yoursupplies
    LEFT JOIN yourborrow ON yoursupplies.walletaddress = yourborrow.walletaddress;
  `;

  const result = await pool.query(query);

  // Extract rows from the result
  const rows = result.rows;
  populatePoolDataArray();
  console.log(poolDataArray);
  // Implement your liquidation logic using the rows data
  for (const row of rows) {
    const suppliedAmount = row.supplied_amount || 0;
    const borrowedAmount = row.borrowed_amount || 0;

    // Find the corresponding poolDataArray entry for supplied and borrowed amounts
    const suppliedPoolData = poolDataArray.find(item => item.poolid === row.supplied_poolid) || { poolid: 0, value: 0 };
    const borrowedPoolData = poolDataArray.find(item => item.poolid === row.borrowed_poolid) || { poolid: 0, value: 0 };

    // Calculate the actual values based on poolDataArray
    const suppliedValue = suppliedPoolData.value * suppliedAmount / (row.supplied_poolid === 1 ? 100000000 : 1);
    const borrowedValue = borrowedPoolData.value * borrowedAmount;

    //console.log("row.supplied_poolid: " + row.supplied_poolid);
    //console.log("suppliedValue: " + suppliedValue);
    //console.log("borrowedValue: " + borrowedValue);

    // Calculate health factor
    const healthFactor = (suppliedValue * collateralFactor) / (borrowedValue / borrowFactor);
   
    console.log(healthFactor);
    if (healthFactor < 1) {
      // Liquidation logic: Perform necessary actions for liquidation
      console.log(`Liquidate user ${row.walletaddress} with health factor ${healthFactor}`);
      
      // Calculate 20% of supplied amount to liquidate
      const liquidationAmount = Math.round(suppliedAmount * 0.2);

      console.log("suppliedAmount: " + suppliedAmount);
      console.log("liquidationAmount: " + liquidationAmount);
      
      // Get the value of the liquidation amount from poolDataArray
      const liquidationValue = suppliedPoolData.value * liquidationAmount / (row.supplied_poolid === 1 ? 100000000 : 1);
      
      /*
        tx_id = perform actual swap in dex and send back the USDC to lendx wallet
      */
      const tx_id = "0000000000";
      await liquidateSuppliedAmount(row.supplied_poolid, liquidationAmount, row.walletaddress, row.supplied_apy, tx_id);

      // Find the corresponding borrow poolid
      const repayAmount = liquidationValue / borrowedPoolData.value;

      // Deduct the liquidated amount from the borrow pool
      await repayBorrowAmount(row.borrowed_poolid, repayAmount, row.walletaddress, row.borrowed_apy, tx_id);

      
    }
  }
}

async function liquidateSuppliedAmount(poolId, amount, walletaddress, apy, tx_id) {
  // Implement your database logic to deduct the amount from the borrow pool
  console.log(`Deducting amount from supplied pool: poolid=${poolId}, amount=${amount}, walletaddress=${walletaddress}`);

  const updateQuery = `
      UPDATE yourSupplies
      SET amount = FLOOR(amount + accrued_interest + (amount * (POWER((1 + apy / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated_datetime)) / 60 / 60 / 24 / 365.25)) - amount) + $1),
          last_updated_datetime = CURRENT_TIMESTAMP,
          apy = apy,
          accrued_interest = 0 
            
      WHERE walletaddress = $2 AND poolid = $3;
    `;

  await pool.query(updateQuery, [amount * -1, walletaddress, poolId]);

  await insertTransactionHistory(walletaddress, poolId, 'Liquidate', amount * -1, 'confirmed', apy, tx_id)
}


async function repayBorrowAmount(poolId, amount, walletaddress, apy, tx_id) {
  // Implement your database logic to deduct the amount from the borrow pool
  console.log(`Repaying amount to borrow pool: poolid=${poolId}, amount=${amount}, walletaddress=${walletaddress}`);

  const updateQuery = `
      UPDATE yourBorrow
      SET amount = amount - accrued_interest - (amount * (POWER((1 + apy / 100), EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated_datetime)) / 60 / 60 / 24 / 365.25)) - amount) + $1,
          last_updated_datetime = CURRENT_TIMESTAMP,
          apy = apy,
          accrued_interest = 0
            
      WHERE walletaddress = $2 AND poolid = $3;
    `;

  await pool.query(updateQuery, [amount * -1, walletaddress, poolId]);

  await insertTransactionHistory(walletaddress, poolId, 'Repay', amount * -1, 'confirmed', apy, tx_id)
}

async function insertTransactionHistory(walletAddress, poolId, type, amount, status, apy, tx_id) {
  // Implement your database logic to insert a transaction history
  console.log(`Inserting transaction history: wallet=${walletAddress}, poolid=${poolId}, type=${type}, amount=${amount}, status=${status}`);

  const queryInsertTransactionHistory = `
      INSERT INTO transactionHistory (pool_id, transaction_type, wallet_address, amount, apy, tx_id, status, datetime)
      VALUES ($1, $7, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `;

    // Assuming you have a connection pool named "pool"
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert into transactionHistory
      await client.query(queryInsertTransactionHistory, [poolId, walletAddress, amount, apy, tx_id, status, type]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error adding supply info:', error);
    } finally {
      client.release();
    }

}





app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
