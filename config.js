const CONFIG = {
    // Basic settings
    "NETWORK": 'testnet',           // 'testnet' or 'mainnet'
    "MAX_RETRIES": 3,               // Number of retry attempts for failed transactions
    "RETRY_DELAY_MS": 5000,         // Delay between retry attempts in milliseconds
    "DELAY_BETWEEN_TX_MS": 60000,     //delay tx
    "DELAY_BETWEEN_WALLETS_MS": 60000, // Delay between processing wallets in milliseconds
    "CHECK_BALANCE_BEFORE_TRANSACTIONS": true, // Check if wallet has enough balance
    "TRACK_TRANSACTIONS": false,    // Save transaction data for analysis
    "USE_JITTER": true,             // Add random variation to delays
    "ROTATE_PROXIES": true,         // Rotate through proxies instead of random selection
    
    // Token operations
    "WRAP": {
        "enabled": true,          // Enable SUI wrapping
        "amount": 100000000,      // Amount in native units (0.1 SUI)
        "label": "SUI Wrapping"   // Operation label for logs
    },
    
    // Swap operations
    "SWAPS": {
        "wSUI_wDUBHE": {
            "enabled": true,      // Enable swap wSUI->wDUBHE
            "amount": 10000000,   // Amount of wSUI to swap
            "min_output": 1,      // Minimum output amount
            "label": "wSUI → wDUBHE Swap"
        },
        "wDUBHE_wSUI": {
            "enabled": true,      // Enable swap wDUBHE->wSUI
            "amount": 1000,       // Amount of wDUBHE to swap
            "min_output": 1,      // Minimum output amount
            "label": "wDUBHE → wSUI Swap"
        },
        "wSUI_wSTARS": {
            "enabled": true,      // Enable swap wSUI->wSTARS
            "amount": 10000000,   // Amount of wSUI to swap
            "min_output": 1,      // Minimum output amount
            "label": "wSUI → wSTARS Swap"
        },
        "wSTARS_wSUI": {
            "enabled": true,      // Enable swap wSTARS->wSUI
            "amount": 1000,       // Amount of wSTARS to swap
            "min_output": 1,      // Minimum output amount
            "label": "wSTARS → wSUI Swap"
        }
    },
    
    // Liquidity operations
    "LIQUIDITY": {
        "wSUI_wDUBHE": {
            "enabled": true,      // Enable add_liquidity for wSUI-wDUBHE
            "asset0": 0,          // Asset index for wSUI
            "asset1": 1,          // Asset index for wDUBHE
            "amount0": 1000000,   // Amount of wSUI to provide
            "amount1": 5765,      // Amount of wDUBHE to provide
            "min0": 1,            // Minimum amount of wSUI to accept
            "min1": 1,            // Minimum amount of wDUBHE to accept
            "label": "wSUI-wDUBHE LP Deposit"
        },
        "wSUI_wSTARS": {
            "enabled": true,      // Enable add_liquidity wSUI-wSTARS
            "asset0": 0,          // Asset index for wSUI
            "asset1": 3,          // Asset index for wSTARS
            "amount0": 1000000,   // Amount of wSUI to provide
            "amount1": 19149,     // Amount of wSTARS to provide
            "min0": 1,            // Minimum amount of wSUI to accept
            "min1": 1,            // Minimum amount of wSTARS to accept
            "label": "wSUI-wSTARS LP Deposit"
        },
        "wDUBHE_wSTARS": {
            "enabled": true,      // Enable add_liquidity for wDUBHE-wSTARS
            "asset0": 1,          // Asset index for wDUBHE
            "asset1": 3,          // Asset index for wSTARS
            "amount0": 2000,      // Amount of wDUBHE to provide
            "amount1": 13873,     // Amount of wSTARS to provide
            "min0": 1,            // Minimum amount of wDUBHE to accept
            "min1": 1,            // Minimum amount of wSTARS to accept
            "label": "wDUBHE-wSTARS LP Deposit"
        }
    }
};

// For backward compatibility with bot.js
const SWAP_wSUI_wDUBHE = CONFIG["SWAPS"]["wSUI_wDUBHE"];
const SWAP_wDUBHE_wSUI = CONFIG["SWAPS"]["wDUBHE_wSUI"];
const SWAP_wSUI_wSTARS = CONFIG["SWAPS"]["wSUI_wSTARS"];
const SWAP_wSTARS_wSUI = CONFIG["SWAPS"]["wSTARS_wSUI"];
const ADD_LIQUIDITY_wSUI_wDUBHE = CONFIG["LIQUIDITY"]["wSUI_wDUBHE"];
const ADD_LIQUIDITY_wSUI_wSTARS = CONFIG["LIQUIDITY"]["wSUI_wSTARS"];
const ADD_LIQUIDITY_wDUBHE_wSTARS = CONFIG["LIQUIDITY"]["wDUBHE_wSTARS"];

// Manually add these to CONFIG to maintain compatibility with bot.js
CONFIG["SWAP_wSUI_wDUBHE"] = SWAP_wSUI_wDUBHE;
CONFIG["SWAP_wDUBHE_wSUI"] = SWAP_wDUBHE_wSUI;
CONFIG["SWAP_wSUI_wSTARS"] = SWAP_wSUI_wSTARS;
CONFIG["SWAP_wSTARS_wSUI"] = SWAP_wSTARS_wSUI;
CONFIG["ADD_LIQUIDITY_wSUI_wDUBHE"] = ADD_LIQUIDITY_wSUI_wDUBHE;
CONFIG["ADD_LIQUIDITY_wSUI_wSTARS"] = ADD_LIQUIDITY_wSUI_wSTARS;
CONFIG["ADD_LIQUIDITY_wDUBHE_wSTARS"] = ADD_LIQUIDITY_wDUBHE_wSTARS;

// Contract addresses and paths
const CONTRACTS = {
    "WRAP_TARGET": "0xa6477a6bf50e2389383b34a76d59ccfbec766ff2decefe38e1d8436ef8a9b245::dubhe_wrapper_system::wrap",
    "DEX_TARGET": "0xa6477a6bf50e2389383b34a76d59ccfbec766ff2decefe38e1d8436ef8a9b245::dubhe_dex_system::swap_exact_tokens_for_tokens",
    "ADD_LIQUIDITY_TARGET": "0xa6477a6bf50e2389383b34a76d59ccfbec766ff2decefe38e1d8436ef8a9b245::dubhe_dex_system::add_liquidity",
    "SHARED_OBJECT": "0x8ece4cb6de126eb5c7a375f90c221bdc16c81ad8f6f894af08e0b6c25fb50a45",
    "PATHS": {
        "wSUI_wDUBHE": [0, 1],
        "wDUBHE_wSUI": [1, 0],
        "wSUI_wSTARS": [0, 3],
        "wSTARS_wSUI": [3, 0],
    },
    // Asset indices for reference
    "ASSET_INDICES": {
        "wSUI": 0,
        "wDUBHE": 1,
        "wSTARS": 3
    }
};

// Export the configuration objects for use in other files
export { CONFIG, CONTRACTS };