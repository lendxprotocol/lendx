// Sample implementation of ray calculations and library functions
//const rayDiv = (a, b) => a / b;
//const rayMul = (a, b) => a * b;
//const wadToRay = (wad) => wad * 10**27; // Placeholder, you may need to implement the actual conversion logic
//const percentMul = (a, b) => (a * b) / 100;

// Constants
const OPTIMAL_USAGE_RATIO = 90;                     // Placeholder, replace with actual value
const MAX_EXCESS_USAGE_RATIO = 10;                   // Placeholder, replace with actual value
const OPTIMAL_STABLE_TO_TOTAL_DEBT_RATIO = 20;       // Placeholder, replace with actual value
const MAX_EXCESS_STABLE_TO_TOTAL_DEBT_RATIO = 80;    // Placeholder, replace with actual value;

const _stableRateSlope1=0.5;
const _stableRateSlope2=60;
const _variableRateSlope1=6;
const _variableRateSlope2=60;
const _stableRateExcessOffset=8;


const CURRENT_SUPPLY=100;

function percentMul(a, b){
    return(a * b) / 100;;
}
function rayMul(a, b){
    return a * b;
}
function rayDiv(a, b){
    return a / b;
}

// Function to calculate interest rates
function calculateInterestRates(params) {
    // Create an instance of CalcInterestRatesLocalVars
    const vars = {
        availableLiquidity: 0,
        totalDebt: 0,
        currentVariableBorrowRate: 0,
        currentStableBorrowRate: 0,
        currentLiquidityRate: 0,
        borrowUsageRatio: 0,
        supplyUsageRatio: 0,
        stableToTotalDebtRatio: 0,
        availableLiquidityPlusDebt: 0
    };

    vars.totalDebt = params.totalStableDebt + params.totalVariableDebt;

    vars.currentLiquidityRate = 0;
    vars.currentVariableBorrowRate = 0; // _baseVariableBorrowRate; // Placeholder, replace with actual value
    vars.currentStableBorrowRate = 0; //getBaseStableBorrowRate(); // Placeholder, replace with actual value

    if (vars.totalDebt !== 0) {
        vars.stableToTotalDebtRatio = rayDiv(params.totalStableDebt, vars.totalDebt);
        vars.availableLiquidity =
            CURRENT_SUPPLY +
            params.liquidityAdded -
            params.liquidityTaken;

        vars.availableLiquidityPlusDebt = vars.availableLiquidity + vars.totalDebt;
        vars.borrowUsageRatio = rayDiv(vars.totalDebt, vars.availableLiquidityPlusDebt);
        vars.supplyUsageRatio = rayDiv(vars.totalDebt, vars.availableLiquidityPlusDebt + params.unbacked);
    }

    if (vars.borrowUsageRatio > OPTIMAL_USAGE_RATIO) {
        let excessBorrowUsageRatio = rayDiv(vars.borrowUsageRatio - OPTIMAL_USAGE_RATIO, MAX_EXCESS_USAGE_RATIO);

        vars.currentStableBorrowRate +=
            _stableRateSlope1 +
            rayMul(_stableRateSlope2, excessBorrowUsageRatio);

        vars.currentVariableBorrowRate +=
            _variableRateSlope1 +
            rayMul(_variableRateSlope2, excessBorrowUsageRatio);
    } else {
        vars.currentStableBorrowRate += rayMul(_stableRateSlope1, rayDiv(vars.borrowUsageRatio, OPTIMAL_USAGE_RATIO));
        vars.currentVariableBorrowRate += rayMul(_variableRateSlope1, rayDiv(vars.borrowUsageRatio, OPTIMAL_USAGE_RATIO));
    }

    if (vars.stableToTotalDebtRatio > OPTIMAL_STABLE_TO_TOTAL_DEBT_RATIO) {
        let excessStableDebtRatio = rayDiv(vars.stableToTotalDebtRatio - OPTIMAL_STABLE_TO_TOTAL_DEBT_RATIO, MAX_EXCESS_STABLE_TO_TOTAL_DEBT_RATIO);
        vars.currentStableBorrowRate += rayMul(_stableRateExcessOffset, excessStableDebtRatio);
    }

    let a =_getOverallBorrowRate(
        params.totalStableDebt,
        params.totalVariableDebt,
        vars.currentVariableBorrowRate,
        params.averageStableBorrowRate
    )

    let b = rayMul(a, vars.supplyUsageRatio)

    vars.currentLiquidityRate = percentMul(b, PercentageMath.PERCENTAGE_FACTOR - params.reserveFactor);

    // vars.currentLiquidityRate = _getOverallBorrowRate(
    //     params.totalStableDebt,
    //     params.totalVariableDebt,
    //     vars.currentVariableBorrowRate,
    //     params.averageStableBorrowRate
    // ).rayMul(vars.supplyUsageRatio).percentMul(
    //     PercentageMath.PERCENTAGE_FACTOR - params.reserveFactor
    // );

    return {
        currentLiquidityRate: vars.currentLiquidityRate,
        currentStableBorrowRate: vars.currentStableBorrowRate,
        currentVariableBorrowRate: vars.currentVariableBorrowRate
    };
}

// Function to calculate overall borrow rate
function _getOverallBorrowRate(totalStableDebt, totalVariableDebt, currentVariableBorrowRate, currentAverageStableBorrowRate) {
    let totalDebt = totalStableDebt + totalVariableDebt;

    if (totalDebt === 0) return 0;

    let weightedVariableRate = rayMul(currentVariableBorrowRate, totalVariableDebt);
    let weightedStableRate = rayMul(currentAverageStableBorrowRate, totalStableDebt);

    // let weightedVariableRate = wadToRay(totalVariableDebt).rayMul(currentVariableBorrowRate);
    // let weightedStableRate = wadToRay(totalStableDebt).rayMul(currentAverageStableBorrowRate);

    let overallBorrowRate = rayDiv((weightedVariableRate + weightedStableRate), totalDebt);

    //let overallBorrowRate = (weightedVariableRate + weightedStableRate).rayDiv(totalDebt);

    return overallBorrowRate;
}

// Placeholder for IERC20 contract
// const IERC20 = {
//     balanceOf: (address) => 0 // Placeholder, replace with actual implementation
// };

// Placeholder for getBaseStableBorrowRate function
function getBaseStableBorrowRate() {
    // Replace with actual implementation
}

// Placeholder for PercentageMath
const PercentageMath = {
    PERCENTAGE_FACTOR: 100 // Placeholder, replace with actual value
};

// Test the function with sample parameters
const params = {
    totalStableDebt: 0,
    totalVariableDebt: 3.10,
    averageStableBorrowRate: 0,
    reserveFactor: 10,
    reserve: 'BTC',
    aToken: '0xaTokenAddress',
    unbacked: 0,
    liquidityAdded: 14.35,
    liquidityTaken: 0
};

// Call the calculateInterestRates function and log the result
const result = calculateInterestRates(params);
console.log(result);
