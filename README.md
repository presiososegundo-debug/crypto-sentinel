# 🛸 Crypto Sentinel

Monitor táctico de BTC/USDT en tiempo real con detección de manipulación de mercado (Smart Money / Stop Hunt) y sistema de auto-aprendizaje.

## Stack

- React + TypeScript + Vite + Tailwind CSS
- Lightweight Charts (TradingView)
- Binance WebSockets (datos en tiempo real, sin API key)

## Características

- Detección de **Stop Hunts** (barridos de liquidez)
- **Order Blocks** y **Fair Value Gaps** automáticos
- Score de confluencia **1–100** con pesos adaptativos
- **Brain auto-learning**: ajusta parámetros tras cada Post-Mortem
- Simulador de operaciones con SL/TP (Fibonacci 0.618 / 1.0 / 1.618)
- Registro completo de trades con PnL en vivo
- Alertas sonoras cuando score ≥ 76

## Instalación

```bash
git clone https://github.com/presiososegundo-debug/crypto-sentinel.git
cd crypto-sentinel
npm install
npm run dev
```

Abre http://localhost:5173. No requiere API keys.

## Requisitos

- Node.js 18+
- npm 9+
