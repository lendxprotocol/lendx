// TransactionHistoryTable.js

import React from 'react';

const TransactionHistoryTable = ({ transactions }) => {
  if (transactions.length === 0) {
    return <div>No transactions found.</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          
          <th>Transaction</th>
          <th>Amount</th>
          <th>APY</th>
          <th>Status</th>
          <th>Transaction ID</th>
          {/* Add more headers based on your data */}
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <tr key={transaction.id}>
            <td>{transaction.transaction_type}</td>
            <td>
    {transaction.symbol === 'BTC' ? transaction.amount / 100000000 : transaction.amount}{' '}
    {transaction.symbol}
  </td>
            <td>{transaction.apy}</td>
            <td>{transaction.status}</td>
            <td>{transaction.tx_id}</td>
            {/* Add more cells based on your data */}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default TransactionHistoryTable;
