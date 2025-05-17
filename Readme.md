# Merak Auto - Sui Blockchain Automation Bot

![Merak Bot](https://img.shields.io/badge/Merak-Bot-blue)
![Version](https://img.shields.io/badge/version-1.2.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

Merak is a powerful automation tool designed for the Sui blockchain that handles token wrapping, swapping, and liquidity provision operations with extensive customization options.

```
  ███╗   ███╗███████╗██████╗  █████╗ ██╗  ██╗    ██████╗  ██████╗ ████████╗
  ████╗ ████║██╔════╝██╔══██╗██╔══██╗██║ ██╔╝    ██╔══██╗██╔═══██╗╚══██╔══╝
  ██╔████╔██║█████╗  ██████╔╝███████║█████╔╝     ██████╔╝██║   ██║   ██║   
  ██║╚██╔╝██║██╔══╝  ██╔══██╗██╔══██║██╔═██╗     ██╔══██╗██║   ██║   ██║   
  ██║ ╚═╝ ██║███████╗██║  ██║██║  ██║██║  ██╗    ██████╔╝╚██████╔╝   ██║   
  ╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═════╝  ╚═════╝    ╚═╝   
```

## Features

- 💰 **SUI Token Wrapping**: Wrap  SUI into wSUI
- 🔄 **Token Swapping**: Execute multiple swap operations between pairs
- 💧 **Liquidity Provision**: Add liquidity to various token pairs
- 🔐 **Multi-Wallet Support**: Process multiple wallets in sequence
- 🕸️ **Proxy Support**: Route transactions through proxies
- 📊 **Transaction Tracking**: Save transaction data for analysis
- 🎯 **Customizable Operations**: Enable/disable specific operations
- 🔄 **Retry Mechanism**: Automatic retries for failed transactions
- 🎭 **Jitter**: Add random timing variations to avoid pattern detection
- 📝 **Detailed Logging**: Colorful and informative console output

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/zackymrf/merak_auto.git
    cd merak_auto
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Create configuration files:
    - Create `mnemonic.txt` with your wallet mnemonics (one per line)
    - Optionally create `proxy.txt` with proxy URLs (one per line)

## Configuration

The bot is highly configurable through the `config.js` file:

```javascript
const CONFIG = {
    // Basic settings
    "NETWORK": 'testnet',          // 'testnet' or 'mainnet'
    "MAX_RETRIES": 3,              // Number of retry attempts
    "DELAY_BETWEEN_TX_MS": 5000,   // Delay between transactions
    "USE_JITTER": true,            // Add randomness to delays

    // Token operations - customize amounts and pairs
    "WRAP": { ... },
    "SWAPS": { ... },
    "LIQUIDITY": { ... }
};
```

### Workflow Explanation

The bot follows this sequence for each wallet:

1. **Initialization**:
   - Loads wallet keys from mnemonic phrases
   - Sets up network connection (direct or via proxy)
   - Checks wallet balance (if enabled)

2. **Operation Sequence**:
   - Wraps native SUI tokens into wSUI
   - Swaps wSUI → wDUBHE
   - Swaps wDUBHE → wSUI
   - Swaps wSUI → wSTARS
   - Swaps wSTARS → wSUI
   - Adds liquidity to wSUI-wSTARS pool
   - Adds liquidity to wSUI-wDUBHE pool
   - Adds liquidity to wDUBHE-wSTARS pool

3. **Completion**:
   - Displays transaction statistics
   - Moves to next wallet after configured delay

## Usage

1. Configure your settings in `config.js`
2. Add your mnemonics to `mnemonic.txt` (one per line)
3. Optionally add proxies to `proxy.txt` (one per line)
4. Run the bot:
    ```bash
    npm start
    ```

## File Structure

```
merak_auto/
├── bot.js            # Main bot logic
├── config.js         # Configuration settings
├── package.json      # Project dependencies
├── mnemonic.txt      # Wallet mnemonics (create this)
├── proxy.txt         # Proxy list (optional)
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

## Proxy Format

Each line in the `proxy.txt` file should follow this format:
```
protocol://username:password@host:port
```

Example:
```
http://user:pass@192.168.1.1:8080
socks5://user:pass@192.168.1.2:1080
```

## Security Considerations

- **NEVER** share your `mnemonic.txt` file
- Always add `mnemonic.txt` and `proxy.txt` to `.gitignore`
- Run the bot in a secure environment
- Test with small amounts before running with larger values

## License

This project is licensed under the terms of the MIT license.

## Contributing

Contributions to the Merak Auto Bot are welcome! Please feel free to submit a Pull Request.

---

**Disclaimer**: This tool is for educational purposes only. Always do your own research before executing blockchain transactions.