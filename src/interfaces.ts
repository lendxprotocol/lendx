// interfaces.ts

export interface Status {
    netWorth: number;
    netAPY: number; 
    healthFactor: number;    
  }
  
  export interface Currency {
    id: number;
    symbol: string; 
    coingecko: string;
    unisat: string;
    lend_apy: number;
    borrow_apy: number;
    value: number; // New field to store Coingecko values
    myWalletBalance?: number; // New field for wallet balance
    poolWalletBalance?: number;
    enabled: boolean;
    allowlending: boolean;
    allowborrowing: boolean;
    maxBorrow: number;
  }
  
  export interface Supply {
    id: number;
    poolid: number;
    symbol: string;
    coingecko: string;
    unisat: string;
    apy: number;
    value?: number; // New field to store Coingecko values
    amount?: number; // New field for wallet balance
    supplied_datetime: Date;
    last_updated_datetime: Date;
    accrued_interest: number;
    accrued_interest_value: number;
    max_withdrawal: number;
  }
  
  export interface Borrow {
    id: number;
    poolid: number;
    symbol: string;
    coingecko: string;
    unisat: string;
    apy: number;
    value?: number; // New field to store Coingecko values
    amount: number; // New field for wallet balance
    borrowed_datetime: Date;
    last_updated_datetime: Date;
    accrued_interest: number;
    accrued_interest_value: number;
  }
  
  export interface SupplyBorrowInfo {
    id: number;
    walletAddress: string;
    poolId: number;
    averageAPY: number;
    amount: number;
    tx_id: number;
  }
  
  export interface TransactionInput {
    hash: Buffer;
    index: number;
    script: {
      type: string;
      data: number[];
    };
    sequence: number;
    witness: any[]; // Adjust this type based on the actual type of witness data
  }
  
  // Assuming you have a similar type for outputs
  export interface Output {
    script: {
      type: string;
      data: number[];
    };
    value: number;
  }
  
  export interface PartialTransaction {
    version: number;
    locktime: number;
    ins: TransactionInput[];
    outs: Output[];
  }

  export interface PendingTransaction {
    id: number;
    pool_id: number;
    transaction_type: string; 
    amount: number;
    apy: number;
    tx_id: string;
    status: string;
    datetime: Date;
    wallet_address: string;
  }
  
  export {};