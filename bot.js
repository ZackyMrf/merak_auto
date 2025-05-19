import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import fs from 'fs';
import { CONFIG, CONTRACTS } from './config.js';
import chalk from 'chalk';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Version information
const BOT_VERSION = "1.3.0";

// ASCII Art for bot header - simplified
const ASCII_LOGO = `
  ███╗   ███╗███████╗██████╗  █████╗ ██╗  ██╗    ██████╗  ██████╗ ████████╗
  ████╗ ████║██╔════╝██╔══██╗██╔══██╗██║ ██╔╝    ██╔══██╗██╔═══██╗╚══██╔══╝
  ██╔████╔██║█████╗  ██████╔╝███████║█████╔╝     ██████╔╝██║   ██║   ██║   
  ██║╚██╔╝██║██╔══╝  ██╔══██╗██╔══██║██╔═██╗     ██╔══██╗██║   ██║   ██║   
  ██║ ╚═╝ ██║███████╗██║  ██║██║  ██║██║  ██╗    ██████╔╝╚██████╔╝   ██║   
  ╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═════╝  ╚═════╝    ╚═╝   
                                                 v${BOT_VERSION} | By MRF
`;

// UI helpers
const DIVIDER = '━'.repeat(80);
const SMALL_DIVIDER = '─'.repeat(40);
const formatAddress = address => !address || address.length < 10 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;
const getTimestamp = () => chalk.dim(`[${new Date().toLocaleTimeString()}]`);
const formatAmount = amount => amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Simplified Logger class
// Simplified Logger class
class Logger {
    static log(type, color, text, address = null, hash = null) {
        // Replace bgKeyword with standard background colors
        let bgColor;
        switch (color) {
            case 'green': bgColor = chalk.bgGreen; break;
            case 'red': bgColor = chalk.bgRed; break;
            case 'blue': bgColor = chalk.bgBlue; break;
            case 'yellow': bgColor = chalk.bgYellow; break;
            case 'magenta': bgColor = chalk.bgMagenta; break;
            case 'cyan': bgColor = chalk.bgCyan; break;
            default: bgColor = chalk.bgWhite;
        }
        
        console.log(`${getTimestamp()} ${bgColor.black(` ${type} `)} ${text}${address ? chalk.cyan(` for ${formatAddress(address)}`) : ''}`);
        if (hash) {
            console.log(`${' '.repeat(11)}${chalk.dim('└─')} ${chalk.green(`📋 Transaction: `)}${chalk.underline.greenBright(`https://${CONFIG.NETWORK === 'mainnet' ? '' : CONFIG.NETWORK + '.'}suivision.xyz/txblock/${hash}`)}`);
        }
    }
    
    // Other methods remain unchanged
    static success(op, account, hash) {
        this.log('SUCCESS', 'green', chalk.yellow(op), account.getPublicKey().toSuiAddress(), hash);
    }
    
    static failure(op, account, error) {
        const address = account.getPublicKey().toSuiAddress();
        this.log('FAILED', 'red', chalk.yellow(op), address);
        console.error(`${' '.repeat(11)}${chalk.dim('└─')} ${chalk.red(`❌ Error: ${error.message}`)}`);
    }
    
    static info(message) {
        this.log('INFO', 'blue', chalk.white(message));
    }
    
    static warning(message) {
        this.log('WARN', 'yellow', chalk.yellow(message));
    }
    
    static network(proxy = null) {
        this.log(proxy ? 'PROXY' : 'NETWORK', proxy ? 'magenta' : 'cyan', 
                 chalk.white(proxy ? 
                            `Connected via ${proxy.replace(/\/\/.*?@/, '//***@')}` : 
                            `Connected directly to ${CONFIG.NETWORK}`));
    }
}

// Helper functions
function loadFromFile(filePath, errorMsg, processLine = line => line) {
    try {
        if (!fs.existsSync(filePath)) return [];
        return fs.readFileSync(filePath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'))
            .map(processLine)
            .filter(item => item !== null);
    } catch (error) {
        Logger.warning(`${errorMsg}: ${error.message}`);
        return [];
    }
}

// Load mnemonics and create keypairs
function loadWalletKeys(filePath = 'mnemonic.txt') {
    return loadFromFile(
        filePath,
        'Failed to read mnemonics',
        (mnemonic, index) => {
            try {
                return Ed25519Keypair.deriveKeypair(mnemonic);
            } catch (keyError) {
                Logger.warning(`Mnemonic at line ${index+1} is invalid: ${keyError.message}`);
                return null;
            }
        }
    );
}

// Load proxies from file
const loadProxies = (filePath = 'proxy.txt') => loadFromFile(filePath, 'Failed to read proxies');

// Select a proxy based on configuration
function selectProxy(proxies, walletIndex) {
    if (!proxies || proxies.length === 0) return null;
    return CONFIG.ROTATE_PROXIES ? 
           proxies[walletIndex % proxies.length] : 
           proxies[Math.floor(Math.random() * proxies.length)];
}

// Pause execution with optional jitter
function pause(milliseconds, jitter = CONFIG.USE_JITTER) {
    let ms = milliseconds;
    if (jitter) {
        const jitterFactor = 0.8 + (Math.random() * 0.4);
        ms = Math.floor(ms * jitterFactor);
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Blockchain operations class - optimized
class BlockchainOperations {
    constructor(rpcClient, wallet) {
        this.client = rpcClient;
        this.wallet = wallet;
        this.address = wallet.getPublicKey().toSuiAddress();
        this.retryCount = CONFIG.MAX_RETRIES || 3;
    }

    // Transaction execution with spinner and retry
    async executeTransaction(txBlock, operationName) {
        for (let attempts = 1; attempts <= this.retryCount; attempts++) {
            try {
                Logger.info(`Executing ${chalk.bold(operationName)}${attempts > 1 ? ` (Attempt ${attempts}/${this.retryCount})` : ''}`);
                
                // Display spinner
                const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
                let i = 0;
                const interval = setInterval(() => {
                    process.stdout.write(`\r${' '.repeat(11)}${chalk.dim('└─')} ${chalk.cyan(spinner[i])} Processing transaction...`);
                    i = (i + 1) % spinner.length;
                }, 100);

                // Execute transaction
                const response = await this.client.signAndExecuteTransactionBlock({
                    signer: this.wallet,
                    transactionBlock: txBlock,
                    options: { showEffects: true, showEvents: true }
                });
                
                // Clear spinner
                clearInterval(interval);
                process.stdout.write('\r' + ' '.repeat(80) + '\r');

                // Check status
                const status = response?.effects?.status?.status;
                if (status === 'success') {
                    Logger.success(operationName, this.wallet, response?.digest);
                    
                    // Store transaction if tracking enabled
                    if (CONFIG.TRACK_TRANSACTIONS) this.storeTransaction(response, operationName);
                    return true;
                } else {
                    throw new Error(`Transaction failed with status: ${status}`);
                }
            } catch (error) {
                // Clear spinner on error
                clearInterval(interval);
                process.stdout.write('\r' + ' '.repeat(80) + '\r');
                
                if (attempts >= this.retryCount) {
                    Logger.failure(operationName, this.wallet, error);
                    if (operationName === CONFIG.WRAP.label) throw error; // Only re-throw for wrap operations
                    return false;
                }
                
                Logger.warning(`${operationName} failed (Attempt ${attempts}/${this.retryCount}): ${error.message}`);
                Logger.info(`Retrying in ${CONFIG.RETRY_DELAY_MS/1000} seconds...`);
                await pause(CONFIG.RETRY_DELAY_MS || 5000);
            }
        }
        return false;
    }

    // Store transaction data
    storeTransaction(txResponse, operationName) {
        try {
            const txDir = './transactions';
            if (!fs.existsSync(txDir)) fs.mkdirSync(txDir);
            
            const address = this.wallet.getPublicKey().toSuiAddress();
            const fileName = `${txDir}/${Date.now()}_${address.substring(0,8)}_${operationName.replace(/\s+/g, '_')}.json`;
            fs.writeFileSync(fileName, JSON.stringify(txResponse, null, 2));
        } catch (error) {
            console.error(`Failed to store transaction: ${error.message}`);
        }
    }

    // Token operations
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

    async provideLiquidity({ poolId, tokenA, tokenB, amountA, amountB, minAmountA, minAmountB, operationName }) {
        const txBlock = new TransactionBlock();
        
        txBlock.moveCall({
            target: CONTRACTS.ADD_LIQUIDITY_TARGET,
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

// Process single wallet with optimized workflow
async function processWallet(keypair, walletIndex, selectedProxy = null) {
    // Setup client with optional proxy
    let clientOptions = { url: getFullnodeUrl(CONFIG.NETWORK || 'testnet') };
    
    if (selectedProxy) {
        try {
            clientOptions.httpAgent = new HttpsProxyAgent(selectedProxy);
            Logger.network(selectedProxy);
        } catch (error) {
            Logger.warning(`Failed to setup proxy: ${error.message}. Continuing with direct connection.`);
        }
    } else {
        Logger.network();
    }
    
    const suiClient = new SuiClient(clientOptions);
    const operations = new BlockchainOperations(suiClient, keypair);
    const stats = { total: 0, successful: 0, failed: 0 };
    const walletAddress = keypair.getPublicKey().toSuiAddress();
    
    console.log('\n' + chalk.bgMagenta.white(' WALLET ') + 
                ' ' + chalk.magenta(`Processing ${formatAddress(walletAddress)} (${walletIndex+1})`));
    console.log(chalk.dim(SMALL_DIVIDER));

    // Check balance if configured
    if (CONFIG.CHECK_BALANCE_BEFORE_TRANSACTIONS) {
        try {
            const balance = await suiClient.getBalance({
                owner: walletAddress,
                coinType: '0x2::sui::SUI'
            });
            
            const balanceNum = Number(balance.totalBalance);
            Logger.log('BALANCE', 'blue', 
                      chalk.white(`${formatAmount(balanceNum / 1_000_000_000)} SUI`));
            
            if (balanceNum < CONFIG.WRAP.amount) {
                Logger.warning(`Insufficient balance (${balanceNum/1_000_000_000} SUI) for wrapping (${CONFIG.WRAP.amount/1_000_000_000} SUI required). Skipping wallet.`);
                return stats;
            }
        } catch (error) {
            Logger.warning(`Failed to check balance: ${error.message}`);
        }
    }
    
    // Define operation sequence with more compact structure
    const operations_queue = [
        // Wrap SUI tokens
        {
            name: 'wrap',
            enabled: CONFIG.WRAP.enabled,
            label: CONFIG.WRAP.label || 'Token Wrapping',
            execute: () => operations.convertSuiToWrapped(),
            critical: true  // Failing this stops all subsequent operations
        },
        
        // Swap operations
        {
            name: 'swap_wSUI_wDUBHE',
            enabled: CONFIG.SWAP_wSUI_wDUBHE?.enabled,
            label: 'wSUI → wDUBHE Swap',
            execute: () => operations.performTokenSwap({
                amount: CONFIG.SWAP_wSUI_wDUBHE.amount,
                routePath: CONTRACTS.PATHS.wSUI_wDUBHE,
                operationName: 'wSUI → wDUBHE Swap'
            })
        },
        {
            name: 'swap_wDUBHE_wSUI',
            enabled: CONFIG.SWAP_wDUBHE_wSUI?.enabled,
            label: 'wDUBHE → wSUI Swap',
            execute: () => operations.performTokenSwap({
                amount: CONFIG.SWAP_wDUBHE_wSUI.amount,
                routePath: CONTRACTS.PATHS.wDUBHE_wSUI,
                operationName: 'wDUBHE → wSUI Swap'
            })
        },
        {
            name: 'swap_wSUI_wSTARS',
            enabled: CONFIG.SWAP_wSUI_wSTARS?.enabled,
            label: 'wSUI → wSTARS Swap',
            execute: () => operations.performTokenSwap({
                amount: CONFIG.SWAP_wSUI_wSTARS.amount,
                routePath: CONTRACTS.PATHS.wSUI_wSTARS,
                operationName: 'wSUI → wSTARS Swap'
            })
        },
        {
            name: 'swap_wSTARS_wSUI',
            enabled: CONFIG.SWAP_wSTARS_wSUI?.enabled,
            label: 'wSTARS → wSUI Swap',
            execute: () => operations.performTokenSwap({
                amount: CONFIG.SWAP_wSTARS_wSUI.amount,
                routePath: CONTRACTS.PATHS.wSTARS_wSUI,
                operationName: 'wSTARS → wSUI Swap'
            })
        },
        
        // Liquidity operations
        {
            name: 'lp_wSUI_wSTARS',
            enabled: CONFIG.ADD_LIQUIDITY_wSUI_wSTARS?.enabled,
            label: CONFIG.ADD_LIQUIDITY_wSUI_wSTARS?.label || 'wSUI-wSTARS LP Deposit',
            execute: () => {
                const config = CONFIG.ADD_LIQUIDITY_wSUI_wSTARS;
                return operations.provideLiquidity({
                    poolId: CONTRACTS.SHARED_OBJECT,
                    tokenA: config.asset0,
                    tokenB: config.asset1,
                    amountA: config.amount0,
                    amountB: config.amount1,
                    minAmountA: config.min0,
                    minAmountB: config.min1,
                    operationName: config.label || 'wSUI-wSTARS LP Deposit'
                });
            }
        },
        {
            name: 'lp_wSUI_wDUBHE',
            enabled: CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE?.enabled,
            label: CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE?.label || 'wSUI-wDUBHE LP Deposit',
            execute: () => {
                const config = CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE;
                return operations.provideLiquidity({
                    poolId: CONTRACTS.SHARED_OBJECT,
                    tokenA: config.asset0,
                    tokenB: config.asset1,
                    amountA: config.amount0,
                    amountB: config.amount1,
                    minAmountA: config.min0,
                    minAmountB: config.min1,
                    operationName: config.label || 'wSUI-wDUBHE LP Deposit'
                });
            }
        },
        {
            name: 'lp_wDUBHE_wSTARS',
            enabled: CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS?.enabled,
            label: CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS?.label || 'wDUBHE-wSTARS LP Deposit',
            execute: () => {
                const config = CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS;
                return operations.provideLiquidity({
                    poolId: CONTRACTS.SHARED_OBJECT,
                    tokenA: config.asset0,
                    tokenB: config.asset1,
                    amountA: config.amount0,
                    amountB: config.amount1,
                    minAmountA: config.min0,
                    minAmountB: config.min1,
                    operationName: config.label || 'wDUBHE-wSTARS LP Deposit'
                });
            }
        }
    ];
    
    // Execute operations in sequence
    for (let i = 0; i < operations_queue.length; i++) {
        const op = operations_queue[i];
        stats.total++;
        
        if (!op.enabled) {
            Logger.info(`Skipping ${op.label} (disabled in config)`);
            continue;
        }
        
        try {
            const success = await op.execute();
            if (success) stats.successful++; else stats.failed++;
            
            // Handle critical operation failure
            if (!success && op.critical) {
                Logger.warning(`Critical operation ${op.label} failed, skipping remaining operations.`);
                break;
            }
            
            // Wait between transactions if not the last one
            if (i < operations_queue.length - 1 && success && CONFIG.DELAY_BETWEEN_TX_MS) {
                const actualDelay = CONFIG.USE_JITTER ? 
                      Math.floor(CONFIG.DELAY_BETWEEN_TX_MS * (0.8 + Math.random() * 0.4)) : 
                      CONFIG.DELAY_BETWEEN_TX_MS;
                
                const waitSeconds = Math.ceil(actualDelay / 1000);
                Logger.info(`Waiting ${waitSeconds} seconds before next transaction...`);
                
                // Countdown timer
                const endTime = Date.now() + actualDelay;
                const interval = setInterval(() => {
                    const remaining = Math.ceil((endTime - Date.now()) / 1000);
                    process.stdout.write(`\r${' '.repeat(11)}${chalk.dim('└─')} ${chalk.cyan('⏱')} Waiting... ${remaining}s remaining`);
                }, 1000);
                
                await pause(actualDelay, false);
                clearInterval(interval);
                process.stdout.write('\r' + ' '.repeat(80) + '\r');
            }
        } catch (error) {
            stats.failed++;
            // Critical errors handled in executeTransaction
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

// Main bot execution flow
async function runBot() {
    const startTime = Date.now();
    console.clear();
    console.log(chalk.cyan(ASCII_LOGO));
    console.log(chalk.dim(DIVIDER));
    
    // Set defaults if not configured
    CONFIG.NETWORK = CONFIG.NETWORK || 'testnet';
    CONFIG.MAX_RETRIES = CONFIG.MAX_RETRIES || 3;
    CONFIG.RETRY_DELAY_MS = CONFIG.RETRY_DELAY_MS || 5000;
    CONFIG.CHECK_BALANCE_BEFORE_TRANSACTIONS = CONFIG.CHECK_BALANCE_BEFORE_TRANSACTIONS !== false;
    
    Logger.info(`Starting Merak Bot v${BOT_VERSION} on ${CONFIG.NETWORK}`);
    
    // Load proxies and wallets
    const proxies = loadProxies();
    if (proxies.length > 0) {
        Logger.info(`Loaded ${proxies.length} proxies from proxy.txt`);
    }
    
    Logger.info(`Loading wallet keys from mnemonic.txt`);
    const walletKeys = loadWalletKeys();
    
    if (walletKeys.length === 0) {
        Logger.warning('No valid keys found. Please check your mnemonic.txt file.');
        return;
    }
    
    Logger.info(`Loaded ${walletKeys.length} wallet${walletKeys.length > 1 ? 's' : ''}`);
    
    // Show configuration summary
    const enabledSwaps = Object.keys(CONFIG).filter(k => k.startsWith('SWAP_') && CONFIG[k]?.enabled).length;
    const enabledLPs = Object.keys(CONFIG).filter(k => k.startsWith('ADD_LIQUIDITY_') && CONFIG[k]?.enabled).length;
    Logger.info(`Configuration: ${CONFIG.WRAP?.enabled ? '✅' : '❌'} Wrapping, ${enabledSwaps} swaps, ${enabledLPs} liquidity provisions`);

    console.log(chalk.dim(DIVIDER));
    
    // Process wallets
    const globalStats = { total: 0, successful: 0, failed: 0 };
    
    for (let i = 0; i < walletKeys.length; i++) {
        Logger.info(`Processing wallet ${i + 1}/${walletKeys.length} (${Math.round((i/walletKeys.length)*100)}% complete)`);
        const selectedProxy = proxies.length > 0 ? selectProxy(proxies, i) : null;
        const walletStats = await processWallet(walletKeys[i], i, selectedProxy);
        
        // Update global stats
        if (walletStats) {
            globalStats.total += walletStats.total;
            globalStats.successful += walletStats.successful;
            globalStats.failed += walletStats.failed;
        }
        
        // Pause between wallets
        if (i < walletKeys.length - 1) {
            const delayMs = CONFIG.DELAY_BETWEEN_WALLETS_MS || CONFIG.DELAY_BETWEEN_TX_MS || 5000;
            Logger.info(`Waiting ${delayMs/1000}s before processing next wallet...`);
            await pause(delayMs);
        }
    }
    
    // Show final summary
    const endTime = Date.now();
    const runDuration = endTime - startTime;
    const minutes = Math.floor(runDuration / 60000);
    const seconds = Math.floor((runDuration % 60000) / 1000);
    
    console.log(chalk.dim(DIVIDER));
    console.log(
        chalk.bgGreenBright.black(' COMPLETE ') + ' ' +
        chalk.green(`Processed ${walletKeys.length} wallets with ${globalStats.successful} successful and ${globalStats.failed} failed transactions`)
    );
    
    console.log(chalk.dim(`Runtime: ${minutes}m ${seconds}s (${new Date(endTime).toLocaleTimeString()})`));
    console.log(chalk.dim(DIVIDER));
}

// Run the bot
runBot().catch(error => {
    console.error('\n' + chalk.bgRed.white(' FATAL ERROR '));
    console.error(error);
    process.exit(1);
});