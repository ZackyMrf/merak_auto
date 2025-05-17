import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import fs from 'fs';
import { CONFIG, CONTRACTS } from './config.js';
import chalk from 'chalk';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Version information
const BOT_VERSION = "1.2.0";

// ASCII Art for bot header
const ASCII_LOGO = `
  ███╗   ███╗███████╗██████╗  █████╗ ██╗  ██╗    ██████╗  ██████╗ ████████╗
  ████╗ ████║██╔════╝██╔══██╗██╔══██╗██║ ██╔╝    ██╔══██╗██╔═══██╗╚══██╔══╝
  ██╔████╔██║█████╗  ██████╔╝███████║█████╔╝     ██████╔╝██║   ██║   ██║   
  ██║╚██╔╝██║██╔══╝  ██╔══██╗██╔══██║██╔═██╗     ██╔══██╗██║   ██║   ██║   
  ██║ ╚═╝ ██║███████╗██║  ██║██║  ██║██║  ██╗    ██████╔╝╚██████╔╝   ██║   
  ╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═════╝  ╚═════╝    ╚═╝   
                                                 v${BOT_VERSION} | By MRF
`;

// Custom divider
const DIVIDER = '━'.repeat(80);
const SMALL_DIVIDER = '─'.repeat(40);

// Function to format wallet address for display (truncate middle)
function formatAddress(address) {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Function to get timestamp
function getTimestamp() {
    const now = new Date();
    return chalk.dim(`[${now.toLocaleTimeString()}]`);
}

// Function to format amounts for display (with commas)
function formatAmount(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Read wallet keys from mnemonics file and create keypairs
function loadWalletKeys(filePath = 'mnemonic.txt') {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(
                chalk.bgRed.white(' ERROR ') +
                chalk.red(` File ${filePath} not found. Please create it with your mnemonics (one per line).`)
            );
            return [];
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        return fileContent.split('\n')
            .map(mnemonic => mnemonic.trim())
            .filter(mnemonic => mnemonic.length > 0 && !mnemonic.startsWith('#'))
            .map((mnemonic, index) => {
                try {
                    return Ed25519Keypair.deriveKeypair(mnemonic);
                } catch (keyError) {
                    console.error(
                        chalk.bgRed.white(' ERROR ') +
                        chalk.red(` Mnemonic at line ${index+1} is invalid: ${keyError.message}`)
                    );
                    return null;
                }
            })
            .filter(keypair => keypair !== null); 
    } catch (error) {
        console.error(
            chalk.bgRed.white(' ERROR ') +
            chalk.red(` Failed to read mnemonics: ${error.message}`)
        );
        return [];
    }
}

// Load proxies from proxy.txt
function loadProxies(filePath = 'proxy.txt') {
    try {
        if (!fs.existsSync(filePath)) {
            return [];
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        return fileContent.split('\n')
            .map(proxy => proxy.trim())
            .filter(proxy => proxy.length > 0 && !proxy.startsWith('#'));
    } catch (error) {
        console.error(
            chalk.bgRed.white(' ERROR ') +
            chalk.red(` Failed to read proxies: ${error.message}`)
        );
        return [];
    }
}

// Select a proxy
function selectProxy(proxies, walletIndex) {
    if (!proxies || proxies.length === 0) return null;
    
    // Either rotate through proxies or pick a random one
    if (CONFIG.ROTATE_PROXIES) {
        return proxies[walletIndex % proxies.length];
    } else {
        return proxies[Math.floor(Math.random() * proxies.length)];
    }
}

// Advanced transaction logger with timestamp and colors
class TransactionLogger {
    static success(operation, account, txHash) {
        const walletAddress = account.getPublicKey().toSuiAddress();
        console.log(
            getTimestamp() + ' ' +
            chalk.bgGreen.black(' SUCCESS ') + ' ' +
            chalk.yellow(`${operation}`) + 
            chalk.cyan(` for ${formatAddress(walletAddress)}`)
        );
        
        if (txHash) {
            console.log(
                ' '.repeat(11) + // Align with timestamp width
                chalk.dim('└─') +  
                chalk.green(`📋 Transaction: `) + 
                chalk.underline.greenBright(`https://${CONFIG.NETWORK === 'mainnet' ? '' : CONFIG.NETWORK + '.'}suivision.xyz/txblock/${txHash}`)
            );
        } else {
            console.log(
                ' '.repeat(11) + // Align with timestamp width
                chalk.dim('└─') +  
                chalk.red('⚠️ Transaction hash unavailable')
            );
        }
    }

    static failure(operation, account, error) {
        const walletAddress = account.getPublicKey().toSuiAddress();
        console.error(
            getTimestamp() + ' ' +
            chalk.bgRed.white(' FAILED ') + ' ' +
            chalk.yellow(`${operation}`) + 
            chalk.cyan(` for ${formatAddress(walletAddress)}`)
        );
        console.error(
            ' '.repeat(11) + // Align with timestamp width
            chalk.dim('└─') +  
            chalk.red(`❌ Error: ${error.message}`)
        );
    }

    static info(message) {
        console.log(
            getTimestamp() + ' ' +
            chalk.bgBlue.white(' INFO ') + ' ' +
            chalk.white(message)
        );
    }

    static warning(message) {
        console.log(
            getTimestamp() + ' ' +
            chalk.bgYellow.black(' WARN ') + ' ' +
            chalk.yellow(message)
        );
    }
    
    static network(proxy = null) {
        if (proxy) {
            console.log(
                getTimestamp() + ' ' +
                chalk.bgMagenta.white(' PROXY ') + ' ' +
                chalk.white(`Connected via ${proxy.replace(/\/\/.*?@/, '//***@')}`)
            );
        } else {
            console.log(
                getTimestamp() + ' ' +
                chalk.bgCyan.black(' NETWORK ') + ' ' +
                chalk.white(`Connected directly to ${CONFIG.NETWORK}`)
            );
        }
    }
}

// Blockchain operations class with retry mechanism
class BlockchainOperations {
    constructor(rpcClient, wallet, retryCount = CONFIG.MAX_RETRIES || 3) {
        this.client = rpcClient;
        this.wallet = wallet;
        this.address = wallet.getPublicKey().toSuiAddress();
        this.retryCount = retryCount;
    }

    async executeTransaction(txBlock, operationName) {
        let attempts = 0;
        
        while (attempts < this.retryCount) {
            attempts++;
            try {
                TransactionLogger.info(`Executing ${chalk.bold(operationName)}${attempts > 1 ? ` (Attempt ${attempts}/${this.retryCount})` : ''}`);
                const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
                let i = 0;
                const interval = setInterval(() => {
                    process.stdout.write(`\r${' '.repeat(11)}${chalk.dim('└─')} ${chalk.cyan(spinner[i])} Processing transaction...`);
                    i = (i + 1) % spinner.length;
                }, 100);

                const response = await this.client.signAndExecuteTransactionBlock({
                    signer: this.wallet,
                    transactionBlock: txBlock,
                    options: {
                        showEffects: true,
                        showEvents: true
                    }
                });
                
                clearInterval(interval);
                process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear the line

                // Check if transaction was successful
                const status = response?.effects?.status?.status;
                if (status === 'success') {
                    TransactionLogger.success(operationName, this.wallet, response?.digest);
                    
                    // Store transaction data if tracking is enabled
                    if (CONFIG.TRACK_TRANSACTIONS) {
                        this.storeTransaction(response, operationName);
                    }
                    
                    return true;
                } else {
                    throw new Error(`Transaction failed with status: ${status}`);
                }
            } catch (error) {
                clearInterval(interval);
                process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear the line
                
                if (attempts >= this.retryCount) {
                    TransactionLogger.failure(operationName, this.wallet, error);
                    if (operationName === 'Token Wrapping') {
                        throw error; // Re-throw only for wrapping operations
                    }
                    return false;
                } else {
                    TransactionLogger.warning(`${operationName} failed (Attempt ${attempts}/${this.retryCount}): ${error.message}`);
                    TransactionLogger.info(`Retrying in ${CONFIG.RETRY_DELAY_MS/1000} seconds...`);
                    await pause(CONFIG.RETRY_DELAY_MS || 5000);
                }
            }
        }
        return false;
    }

    // Store transaction data for analysis
    storeTransaction(txResponse, operationName) {
        try {
            const txDir = './transactions';
            if (!fs.existsSync(txDir)) {
                fs.mkdirSync(txDir);
            }
            
            const address = this.wallet.getPublicKey().toSuiAddress();
            const fileName = `${txDir}/${Date.now()}_${address.substring(0,8)}_${operationName.replace(/\s+/g, '_')}.json`;
            
            fs.writeFileSync(fileName, JSON.stringify(txResponse, null, 2));
        } catch (error) {
            // Silently fail - this is just for logging
            console.error(`Failed to store transaction: ${error.message}`);
        }
    }

    async convertSuiToWrapped() {
        const txBlock = new TransactionBlock();
        const [coinToWrap] = txBlock.splitCoins(txBlock.gas, [CONFIG.WRAP.amount]);
        
        txBlock.moveCall({
            target: CONTRACTS.WRAP_TARGET,
            arguments: [
                txBlock.object(CONTRACTS.SHARED_OBJECT),
                coinToWrap,
                txBlock.pure.address(this.address),
            ],
            typeArguments: ['0x2::sui::SUI'],
        });
        
        return this.executeTransaction(txBlock, CONFIG.WRAP.label || 'Token Wrapping');
    }

    async performTokenSwap({ amount, routePath, operationName }) {
        const txBlock = new TransactionBlock();
        
        txBlock.moveCall({
            target: CONTRACTS.DEX_TARGET,
            arguments: [
                txBlock.object(CONTRACTS.SHARED_OBJECT),
                txBlock.pure(BigInt(amount), 'u256'),
                txBlock.pure(BigInt(1), 'u256'), // minimum output amount
                txBlock.pure(routePath, 'vector<u256>'),
                txBlock.pure.address(this.address),
            ],
            typeArguments: [],
        });
        
        return this.executeTransaction(txBlock, operationName);
    }

    async provideLiquidity({
        poolId,
        tokenA,
        tokenB,
        amountA,
        amountB,
        minAmountA,
        minAmountB,
        operationName
    }) {
        const txBlock = new TransactionBlock();
        
        txBlock.moveCall({
            target: CONTRACTS.ADD_LIQUIDITY_TARGET || '0xa6477a6bf50e2389383b34a76d59ccfbec766ff2decefe38e1d8436ef8a9b245::dubhe_dex_system::add_liquidity',
            arguments: [
                txBlock.object(poolId),
                txBlock.pure(BigInt(tokenA), 'u256'),
                txBlock.pure(BigInt(tokenB), 'u256'),
                txBlock.pure(BigInt(amountA), 'u256'),
                txBlock.pure(BigInt(amountB), 'u256'),
                txBlock.pure(BigInt(minAmountA), 'u256'),
                txBlock.pure(BigInt(minAmountB), 'u256'),
                txBlock.pure.address(this.address),
            ],
            typeArguments: [],
        });
        
        return this.executeTransaction(txBlock, operationName);
    }
}

// Pause execution with optional jitter for randomness
function pause(milliseconds, jitter = false) {
    let ms = milliseconds;
    if (jitter) {
        // Add random jitter of ±20% to avoid pattern detection
        const jitterFactor = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
        ms = Math.floor(ms * jitterFactor);
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Process a single wallet with statistics tracking
async function processWallet(keypair, walletIndex, selectedProxy = null) {
    // Initialize client with proxy if available
    let clientOptions = { url: getFullnodeUrl(CONFIG.NETWORK || 'testnet') };
    
    // Add proxy if available
    if (selectedProxy) {
        try {
            const agent = new HttpsProxyAgent(selectedProxy);
            clientOptions.httpAgent = agent;
            TransactionLogger.network(selectedProxy);
        } catch (error) {
            TransactionLogger.warning(`Failed to setup proxy: ${error.message}. Continuing with direct connection.`);
        }
    } else {
        TransactionLogger.network();
    }
    
    const suiClient = new SuiClient(clientOptions);
    
    // Create operations handler
    const operations = new BlockchainOperations(suiClient, keypair);
    
    // Track transaction statistics
    const stats = {
        total: 0,
        successful: 0,
        failed: 0
    };

    const walletAddress = keypair.getPublicKey().toSuiAddress();
    
    console.log('\n' + chalk.bgMagenta.white(' WALLET ') + 
                ' ' + chalk.magenta(`Processing ${formatAddress(walletAddress)} (${walletIndex+1})`));
    console.log(chalk.dim(SMALL_DIVIDER));

    // Check wallet balance
    if (CONFIG.CHECK_BALANCE_BEFORE_TRANSACTIONS) {
        try {
            const balance = await suiClient.getBalance({
                owner: walletAddress,
                coinType: '0x2::sui::SUI'
            });
            
            console.log(
                getTimestamp() + ' ' +
                chalk.bgBlue.white(' BALANCE ') + ' ' +
                chalk.white(`${formatAmount(Number(balance.totalBalance) / 1_000_000_000)} SUI`)
            );
            
            // Check if balance is sufficient for operations
            if (Number(balance.totalBalance) < CONFIG.WRAP.amount) {
                TransactionLogger.warning(`Insufficient balance (${Number(balance.totalBalance)/1_000_000_000} SUI) for wrapping (${CONFIG.WRAP.amount/1_000_000_000} SUI required). Skipping wallet.`);
                return;
            }
        } catch (error) {
            TransactionLogger.warning(`Failed to check balance: ${error.message}`);
        }
    }
    
    // Define transaction sequence
    const transactionSequence = [
        // 1. Wrap SUI tokens
        async () => {
            stats.total++;
            if (!CONFIG.WRAP.enabled) {
                TransactionLogger.info(`Skipping Token Wrapping (disabled in config)`);
                return true;
            }
            try {
                const result = await operations.convertSuiToWrapped();
                if (result) stats.successful++; else stats.failed++;
                return result;
            } catch {
                stats.failed++;
                return false;
            }
        },
        
        // 2. Swap wSUI to wDUBHE
        async () => {
            stats.total++;
            if (!CONFIG.SWAP_wSUI_wDUBHE.enabled) {
                TransactionLogger.info(`Skipping wSUI → wDUBHE Swap (disabled in config)`);
                return true;
            }
            const result = await operations.performTokenSwap({
                amount: CONFIG.SWAP_wSUI_wDUBHE.amount,
                routePath: CONTRACTS.PATHS.wSUI_wDUBHE,
                operationName: 'wSUI → wDUBHE Swap'
            });
            if (result) stats.successful++; else stats.failed++;
            return result;
        },
        
        // 3. Swap wDUBHE to wSUI
        async () => {
            stats.total++;
            if (!CONFIG.SWAP_wDUBHE_wSUI.enabled) {
                TransactionLogger.info(`Skipping wDUBHE → wSUI Swap (disabled in config)`);
                return true;
            }
            const result = await operations.performTokenSwap({
                amount: CONFIG.SWAP_wDUBHE_wSUI.amount,
                routePath: CONTRACTS.PATHS.wDUBHE_wSUI,
                operationName: 'wDUBHE → wSUI Swap'
            });
            if (result) stats.successful++; else stats.failed++;
            return result;
        },
        
        // 4. Swap wSUI to wSTARS
        async () => {
            stats.total++;
            if (!CONFIG.SWAP_wSUI_wSTARS.enabled) {
                TransactionLogger.info(`Skipping wSUI → wSTARS Swap (disabled in config)`);
                return true;
            }
            const result = await operations.performTokenSwap({
                amount: CONFIG.SWAP_wSUI_wSTARS.amount,
                routePath: CONTRACTS.PATHS.wSUI_wSTARS,
                operationName: 'wSUI → wSTARS Swap'
            });
            if (result) stats.successful++; else stats.failed++;
            return result;
        },
        
        // 5. Swap wSTARS to wSUI
        async () => {
            stats.total++;
            if (!CONFIG.SWAP_wSTARS_wSUI.enabled) {
                TransactionLogger.info(`Skipping wSTARS → wSUI Swap (disabled in config)`);
                return true;
            }
            const result = await operations.performTokenSwap({
                amount: CONFIG.SWAP_wSTARS_wSUI.amount,
                routePath: CONTRACTS.PATHS.wSTARS_wSUI,
                operationName: 'wSTARS → wSUI Swap'
            });
            if (result) stats.successful++; else stats.failed++;
            return result;
        },
        
        // 6. Add Liquidity wSUI-wSTARS
        async () => {
            stats.total++;
            if (!CONFIG.ADD_LIQUIDITY_wSUI_wSTARS?.enabled) {
                TransactionLogger.info(`Skipping wSUI-wSTARS LP Deposit (disabled in config)`);
                return true;
            }
            const config = CONFIG.ADD_LIQUIDITY_wSUI_wSTARS;
            const result = await operations.provideLiquidity({
                poolId: CONTRACTS.SHARED_OBJECT,
                tokenA: config.asset0,
                tokenB: config.asset1,
                amountA: config.amount0,
                amountB: config.amount1,
                minAmountA: config.min0,
                minAmountB: config.min1,
                operationName: config.label || 'wSUI-wSTARS LP Deposit'
            });
            if (result) stats.successful++; else stats.failed++;
            return result;
        },
        
        // 7. Add Liquidity wSUI-wDUBHE
        async () => {
            stats.total++;
            if (!CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE?.enabled) {
                TransactionLogger.info(`Skipping wSUI-wDUBHE LP Deposit (disabled in config)`);
                return true;
            }
            const config = CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE;
            const result = await operations.provideLiquidity({
                poolId: CONTRACTS.SHARED_OBJECT,
                tokenA: config.asset0,
                tokenB: config.asset1,
                amountA: config.amount0,
                amountB: config.amount1,
                minAmountA: config.min0,
                minAmountB: config.min1,
                operationName: config.label || 'wSUI-wDUBHE LP Deposit'
            });
            if (result) stats.successful++; else stats.failed++;
            return result;
        },
        
        // 8. Add Liquidity wDUBHE-wSTARS
        async () => {
            stats.total++;
            if (!CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS?.enabled) {
                TransactionLogger.info(`Skipping wDUBHE-wSTARS LP Deposit (disabled in config)`);
                return true;
            }
            const config = CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS;
            const result = await operations.provideLiquidity({
                poolId: CONTRACTS.SHARED_OBJECT,
                tokenA: config.asset0,
                tokenB: config.asset1,
                amountA: config.amount0,
                amountB: config.amount1,
                minAmountA: config.min0,
                minAmountB: config.min1,
                operationName: config.label || 'wDUBHE-wSTARS LP Deposit'
            });
            if (result) stats.successful++; else stats.failed++;
            return result;
        }
    ];
    
    // Execute transactions in sequence
    for (let i = 0; i < transactionSequence.length; i++) {
        const txOperation = transactionSequence[i];
        const success = await txOperation();
        
        // Wait between transactions
        if (i < transactionSequence.length - 1) {
            if (success && CONFIG.DELAY_BETWEEN_TX_MS) {
                // Use jitter for more natural timing
                const useJitter = CONFIG.USE_JITTER || false;
                await pause(CONFIG.DELAY_BETWEEN_TX_MS, useJitter);
            }
        }
        
        if (!success && i === 0) {
            // If the first operation (wrapping) fails, skip all other operations
            TransactionLogger.warning(`Initial token wrapping failed, skipping remaining operations.`);
            break;
        }
    }

    // Display wallet transaction summary
    console.log(chalk.dim(SMALL_DIVIDER));
    console.log(
        chalk.bgMagenta.white(' SUMMARY ') + ' ' +
        `Wallet ${formatAddress(walletAddress)}: ` +
        chalk.green(`${stats.successful} successful`) + ', ' +
        chalk.red(`${stats.failed} failed`) + ', ' +
        `${stats.total} total`
    );
    
    return stats;
}

// Main execution function with enhanced UI
async function runBot() {
    // Start time tracking
    const startTime = Date.now();
    
    // Clear terminal
    console.clear();

    // Display ASCII art and header
    console.log(chalk.cyan(ASCII_LOGO));
    console.log(chalk.dim(DIVIDER));
    
    // Set default config values if not provided
    CONFIG.NETWORK = CONFIG.NETWORK || 'testnet';
    CONFIG.MAX_RETRIES = CONFIG.MAX_RETRIES || 3;
    CONFIG.RETRY_DELAY_MS = CONFIG.RETRY_DELAY_MS || 5000;
    CONFIG.CHECK_BALANCE_BEFORE_TRANSACTIONS = CONFIG.CHECK_BALANCE_BEFORE_TRANSACTIONS !== false;
    
    TransactionLogger.info(`Starting Merak Bot v${BOT_VERSION} on ${CONFIG.NETWORK}`);
    
    // Load proxies if supported
    const proxies = loadProxies();
    if (proxies.length > 0) {
        TransactionLogger.info(`Loaded ${proxies.length} proxies from proxy.txt`);
    }
    
    // Load wallet keys
    TransactionLogger.info(`Loading wallet keys from mnemonic.txt`);
    const walletKeys = loadWalletKeys();
    
    if (walletKeys.length === 0) {
        TransactionLogger.warning('No valid keys found. Please check your mnemonic.txt file.');
        return;
    }
    
    TransactionLogger.info(`Loaded ${walletKeys.length} wallet${walletKeys.length > 1 ? 's' : ''}`);
    
    // Show config summary
    TransactionLogger.info(`Configuration: ${CONFIG.WRAP.enabled ? '✅' : '❌'} Wrapping, ${
        Object.keys(CONFIG).filter(k => k.startsWith('SWAP_') && CONFIG[k].enabled).length
    } swaps, ${
        Object.keys(CONFIG).filter(k => k.startsWith('ADD_LIQUIDITY_') && CONFIG[k].enabled).length
    } liquidity provisions`);

    console.log(chalk.dim(DIVIDER));
    
    // Process each wallet sequentially
    let totalWallets = walletKeys.length;
    let completedWallets = 0;
    
    // Global stats
    const globalStats = {
        total: 0,
        successful: 0,
        failed: 0
    };
    
    for (let i = 0; i < walletKeys.length; i++) {
        // Show progress
        TransactionLogger.info(`Processing wallet ${i + 1}/${walletKeys.length} (${Math.round((i/walletKeys.length)*100)}% complete)`);
        
        // Select a proxy for this wallet if available
        const selectedProxy = proxies.length > 0 ? selectProxy(proxies, i) : null;
        
        // Process wallet
        const walletStats = await processWallet(walletKeys[i], i, selectedProxy);
        
        // Update global stats if available
        if (walletStats) {
            globalStats.total += walletStats.total;
            globalStats.successful += walletStats.successful;
            globalStats.failed += walletStats.failed;
        }
        
        completedWallets++;
        
        // Pause between wallets
        if (i < walletKeys.length - 1) {
            const delayMs = CONFIG.DELAY_BETWEEN_WALLETS_MS || CONFIG.DELAY_BETWEEN_TX_MS || 5000;
            TransactionLogger.info(`Waiting ${delayMs/1000}s before processing next wallet...`);
            await pause(delayMs, CONFIG.USE_JITTER);
        }
    }
    
    // Calculate runtime
    const endTime = Date.now();
    const runDuration = endTime - startTime;
    const minutes = Math.floor(runDuration / 60000);
    const seconds = Math.floor((runDuration % 60000) / 1000);
    
    // Display completion message
    console.log(chalk.dim(DIVIDER));
    console.log(
        chalk.bgGreenBright.black(' COMPLETE ') + ' ' +
        chalk.green(`Processed ${completedWallets}/${totalWallets} wallets with ${globalStats.successful} successful and ${globalStats.failed} failed transactions`)
    );
    
    // Display runtime statistics
    console.log(chalk.dim(`Runtime: ${minutes}m ${seconds}s (${new Date(endTime).toLocaleTimeString()})`));
    console.log(chalk.dim(DIVIDER));
}

// Execute main function
runBot().catch(error => {
    console.error('\n' + chalk.bgRed.white(' FATAL ERROR '));
    console.error(error);
    process.exit(1);
});