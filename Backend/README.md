Stellara_backend
🚀 Stellara Backend — Web3 Crypto Academy Server

Stellara Backend is the server-side application powering Stellara AI, a next-generation Web3 learning and social trading platform built on the Stellar blockchain ecosystem. It is designed for crypto learners and traders who need real-time communication, secure account systems, AI-assisted learning tools, and on-chain trading services.

This backend manages authentication, courses, rewards, social feeds, messaging, AI integrations, and blockchain interactions, while exposing REST APIs and WebSocket gateways consumed by the Stellara AI frontend.

🚀 Overview
Stellara AI is designed to educate, empower, and connect crypto users by combining:

A crypto learning academy with structured courses and quizzes
An AI-powered assistant with text and voice guidance
A social crypto network with posts, comments, and interactions
Real-time messaging for one-on-one and group discussions
On-chain trading tools integrated with Stellar wallets
Live market news and insights powered by AI
The backend is responsible for securely managing the core application logic, database interactions, and blockchain integrations.

🧠 Core Features
🤖 Stellara AI Assistant
Text & voice-based AI crypto mentor
Explains trading strategies, blockchain concepts, and Stellar-specific tools
Provides market insights & educational guidance (not financial advice)

🛡️ **Error handling & Observability**
* Structured JSON logging with correlation IDs for tracing requests across services (`x-correlation-id` header is emitted on every response)
* Global exception filter with error categorization and severity levels
* Centralized error tracking stub (easily swapped for Sentry/Datadog)
* Prometheus metrics exposed at `/metrics` including error rate counters
* Critical errors automatically escalate to alerts

🎯 **Advanced Caching Layer**
* Distributed caching with Redis Cluster support (3 master + 3 replica nodes)
* Cache-aside, write-through, and write-behind patterns implementation
* Cache invalidation strategies: key-based, tag-based, pattern-based, and rule-based
* Cross-instance cache coherency using Redis Pub/Sub for broadcasting invalidations
* Cache warming mechanisms: priority-based, scheduled (hourly/daily/weekly), and distributed warmup
* Cache consistency: version tracking, conflict detection, and Last-Write-Wins resolution
* Comprehensive monitoring: hit/miss rates, memory usage, evictions, and performance metrics
* Health checks and alerting for cache performance degradation
* Sharding strategies: consistent hashing (160 virtual nodes) and CRC16 slot mapping
* REST API endpoints for cache management and monitoring

🎓 Crypto Academy
Structured learning paths (Beginner → Pro)
Stellar & Soroban smart contract education
Interactive quizzes and progress tracking
🗣 Social Crypto Feed
Post updates, ideas, and market thoughts
Like, comment, repost (tweet-style)
Follow other traders & educators
💬 Community Chat
One-on-one messaging
Group discussions & learning channels
Trading & ecosystem-focused rooms
📈 Trading & Wallet
Trade Stellar-based assets
Freighter wallet integration
Portfolio overview & transaction history
📰 News & Market Intelligence
Real-time crypto news
Stellar ecosystem updates
Market trend summaries via AI
🛠 Technology Stack
Backend
NestJS – API framework
PostgreSQL – Relational database
Redis – Distributed caching with cluster support, real-time messaging
WebSocket Gateway – Real-time chat & feed
Blockchain
Stellar SDK & Horizon API
Soroban Smart Contracts
Freighter Wallet integration
AI & Voice
LLM API (OpenAI or equivalent)
Speech-to-Text (Whisper or similar)
Text-to-Speech (TTS)
Infrastructure
Docker for containerization
AWS / Railway / Render for backend hosting
Vercel for frontend deployment
💎 Why Stellara AI Works
Instantly signals AI intelligence
Strong connection to Stellar blockchain
Easy to market & brand
Scales to mobile apps, APIs, and future tools
Credible to investors and partners
⚡ Getting Started

✅ Requirements

- Node.js v18+
- PostgreSQL
- Redis
- npm or pnpm

📦 Installation

```bash
git clone https://github.com/stellara-network/Stellara_Contracts
cd Stellara_Contracts/Backend
npm install
```

🔐 Secrets Management

This project uses **HashiCorp Vault** for secure secrets management. Secrets are NOT stored in the repository.

**Quick Start:**

1. **Local Development with Vault:**
   ```bash
   # Start Vault dev server (in a separate terminal)
   vault server -dev
   
   # In another terminal, provision development secrets
   export VAULT_ADDR='http://localhost:8200'
   export VAULT_TOKEN='devroot'
   ./scripts/vault/provision-dev.sh
   ```

2. **Local Development with .env.local:**
   ```bash
   # Create .env.local (ignored by git)
   cp .env.example .env.local
   # Edit .env.local with your development secrets
   ```

**For detailed setup instructions, see:**
- [Local Secrets Setup Guide](./docs/LOCAL_SECRETS_SETUP.md)
- [Secrets Management Strategy](./docs/SECRETS_MANAGEMENT.md)
- [Vault Client Implementation](./docs/VAULT_CLIENT_NODEJS.md)

⚠️ **SECURITY**: Never commit real secrets to the repository. See [.gitignore](.gitignore) for ignored files.

▶ Run Development Server npm run start:dev

▶ Run Development Server npm run start:dev

🎯 **Cache Management Endpoints**
* GET `/cache/entry/:key` - Retrieve cache entry
* POST `/cache/entry` - Set cache entry
* DELETE `/cache/entry/:key` - Delete cache entry
* DELETE `/cache/tag/:tag` - Delete cache entries by tag
* DELETE `/cache/clear` - Clear all cache entries
* POST `/cache/invalidate/key/:key` - Invalidate specific cache key
* POST `/cache/invalidate/tag/:tag` - Invalidate cache entries by tag
* POST `/cache/invalidate/pattern/:pattern` - Invalidate cache entries by pattern
* POST `/cache/warmup/group/:name/execute` - Execute warmup group
* GET `/cache/stats` - Get cache statistics
* GET `/cache/health` - Get cache health status
* GET `/cache/alerts` - Get cache alerts
* POST `/cache/alerts/:id/resolve` - Resolve cache alert
* GET `/cache/report` - Generate cache performance report

🧪 Testing npm run test npm run test:e2e

🤝 Contributing The first step is to Fork the repository then you Create a feature branch Commit your changes git pull latest changes to avoid conflicts Submit a pull request Issues and feature requests are welcome.

🗄️ Database & Migrations Workflow

Para garantizar la integridad de los datos y la consistencia entre entornos, este proyecto utiliza **Prisma Migrations** y **Docker**.

1. Infraestructura Local
Levanta la base de datos PostgreSQL utilizando el contenedor preconfigurado:
bash
docker-compose up -d

Nota: La base de datos está mapeada al puerto 5432 para evitar conflictos con instalaciones locales preexistentes.

2. Comandos de Migración
Utiliza estos scripts para gestionar el esquema de la base de datos:

Generar y Aplicar Migración: (Después de modificar schema.prisma)
bash
npm run db:migrate

Generar Migración con Nombre Específico:
bash
npx prisma migrate dev --name NombreDeLaMigracion

Aplicar Migraciones en Producción:
bash
npm run db:migrate:deploy

Revertir Cambios: (Deshace la última migración aplicada)
bash
npx prisma migrate resolve --rolled-back

Studio para Visualizar la Base de Datos:
bash
npm run db:studio

3. Buenas Prácticas
Nunca modifiques manualmente las tablas en la base de datos; usa siempre archivos de migración.

Revisa los archivos generados en prisma/migrations/ antes de hacer commit para asegurar que el SQL es el esperado.

Asegúrate de que tu archivo .env apunte al puerto 5432 si usas el entorno Docker provisto.

Para desarrollo local, usa `prisma db push` para sincronización rápida (no genera archivos de migración). Para producción, siempre usa migraciones.