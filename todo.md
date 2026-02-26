# Monitor de Audio - TODO

## Banco de Dados / Schema
- [x] Tabela `musicians` (perfis de músicos com PIN, instrumento, BUS)
- [x] Tabela `channels` (mapeamento IN/STIN para instrumento)
- [x] Tabela `mix_presets` (mixes salvos por músico)
- [x] Tabela `mixer_config` (IP, porta, modo simulador, configurações globais)
- [x] Tabela `channel_sends` (níveis de send por canal/bus)

## Backend
- [x] Módulo MatrixClient (TCP/UDP para protocolo Nctrl)
- [x] Modo simulador (respostas mock de GAIN/MUTE/VU)
- [x] WebSocket server para atualizações em tempo real
- [x] tRPC router: musicians (CRUD)
- [x] tRPC router: channels (CRUD mapeamento)
- [x] tRPC router: mixer (conectar, status, comandos)
- [x] tRPC router: sends (get/set nível de send)
- [x] tRPC router: presets (salvar/carregar mix)
- [x] tRPC router: admin (configurações globais + seed padrão)
- [x] Rate limiting e validação de PIN
- [x] Debounce de comandos (100ms)

## Frontend - Design System
- [x] Tema escuro estilo console profissional (index.css)
- [x] Fonte JetBrains Mono para valores numéricos
- [x] Cores LED-style (verde, amarelo, vermelho para VU)
- [x] Componente Slider vertical estilo fader (VerticalFader)
- [x] Componente VU Meter LED-style (VUMeter)
- [x] Indicadores LED (ConnectionStatus)

## Frontend - Telas
- [x] Tela 1: Seleção de Instrumento (cards grandes com ícones)
- [x] Tela 2: Meu Fone (sliders + VU meters + mute por canal)
- [x] Tela 3: Login com PIN por perfil (modal numpad)
- [x] Tela 4: Painel Admin (mapeamento canais, configuração IP/porta)
- [x] Indicador de conexão Online/Offline/Simulador
- [x] Botão Reset My Mix
- [x] Botão Salvar/Carregar preset

## Integração
- [x] WebSocket client no frontend (WebSocketContext)
- [x] Atualização em tempo real dos VU meters
- [x] Debounce nos sliders (não floodar rede)
- [x] Reconexão automática WebSocket

## Testes
- [x] Testes vitest para MatrixClient (modo simulador) - 19 testes
- [x] Testes vitest para auth router - 1 teste
- [x] Total: 20 testes passando

## Documentação
- [ ] README com instruções de conexão ao mixer
- [ ] Documentação do protocolo Nctrl
- [ ] Checklist de deploy (notebook, Raspberry Pi)

## PWA (Progressive Web App)
- [x] Gerar ícones PWA (192x192, 512x512, maskable, apple-touch-icon)
- [x] Criar manifest.json com nome, cores, display standalone
- [x] Criar service worker com cache offline (shell + assets estáticos)
- [x] Registrar service worker no App.tsx via hook usePWA
- [x] Adicionar meta tags iOS (apple-mobile-web-app-*)
- [x] Adicionar meta tags Android/Chrome
- [x] Componente banner de instalação (prompt de Add to Home Screen)
- [x] Upload ícones para S3 e referenciar via CDN

## Salvar Mix (Presets Pessoais)
- [x] Tabela `mixPresets` no schema do banco (id, musicianId, name, data JSON, createdAt)
- [x] Helpers de DB: savePreset, listPresets, loadPreset, deletePreset
- [x] Rotas tRPC: presets.save, presets.list, presets.load, presets.delete
- [x] Botão "Salvar Mix" na tela MonitorPage (toolbar, verde, destaque)
- [x] Modal bottom-sheet com tabs Salvar/Carregar
- [x] Lista de presets com data relativa, botão carregar e deletar com confirmação
- [x] Feedback visual ao salvar/carregar (toast + animação slide-up)
- [x] Testes unitários para as rotas de preset (8 testes, todos passando)

## Descoberta Automática de Rede
- [x] Módulo network-scanner.ts: detectar IP local do servidor, scan TCP paralelo na sub-rede
- [x] Portas Nctrl conhecidas da Waldman: 3000, 8080, 8888, 9000, 10000
- [x] Rota tRPC mixer.scan (retorna lista de hosts:porta encontrados)
- [x] Rota tRPC mixer.localInfo (retorna IP e sub-rede do servidor)
- [x] UI no Painel Admin: seção DESCOBERTA AUTOMÁTICA expansível com botão de scan
- [x] Lista de dispositivos com badge WALDMAN, latência, resposta e botão USAR
- [x] Auto-preenchimento do IP/porta e desativação do simulador ao selecionar
- [x] Testes unitários para o scanner (10 testes, todos passando)

## Reconexão Automática (Watchdog)
- [x] Módulo reconnect-watchdog.ts com estados: idle, watching, connecting, connected, stopped
- [x] Intervalo base de 30s, backoff exponencial até 5min (30→60→120→240→300s), reset ao conectar
- [x] Contador de tentativas, timestamp da última tentativa e próxima tentativa
- [x] Para automaticamente em simulatorMode=true ou desconexão manual
- [x] Rotas tRPC: mixer.watchdogStatus, mixer.watchdogStart, mixer.watchdogStop
- [x] Integrado em server/_core/index.ts com eventos disconnected/reconnected
- [x] Card WatchdogStatus no Painel Admin com countdown, stats e controles
- [x] Broadcast WebSocket aos clientes em cada tentativa e reconexão
- [x] 23 testes unitários para o watchdog (todos passando)
